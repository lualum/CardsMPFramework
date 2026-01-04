import type { GameSocket } from "server";
import { emitRoomList, gameSockets, io, MENU_ROOM, rooms } from "server";
import type { Server } from "socket.io";
import type { Card } from "../shared/card";
import { GamePhase } from "../shared/game";
import { PlayerStatus } from "../shared/player";
import { Room, RoomStatus } from "../shared/room";

export function setupHandlers(socket: GameSocket): void {
   socket.on("ping", () => {
      socket.emit("pong");
   });

   socket.on("set-name", (name: string) => {
      socket.player.name = name.trim().slice(0, 20);
   });

   socket.on("create-room", () => {
      const code = createRoom();
      if (!code) {
         socket.emit("error", "Room limit reached");
         return;
      }

      joinRoom(socket, io, code);

      emitRoomList();
   });

   socket.on("join-room", (code: string) => {
      joinRoom(socket, io, code.toUpperCase());
      emitRoomList();
   });

   socket.on("leave-room", () => {
      handlePlayerLeave(socket);
      socket.join(MENU_ROOM);
   });

   socket.on("disconnect", () => {
      gameSockets.delete(socket.id);
      handlePlayerLeave(socket);
   });

   socket.on("toggle-ready", () => {
      if (!socket.room || socket.room.status === RoomStatus.PLAYING) return;

      socket.player.status =
         socket.player.status === PlayerStatus.READY
            ? PlayerStatus.NOT_READY
            : PlayerStatus.READY;

      io.to(socket.room.code).emit(
         "p-set-status",
         socket.player.id,
         socket.player.status
      );

      if (socket.room.tryStartRoom()) {
         // Send to each socket independently with their own player perspective
         for (const player of socket.room.players.values()) {
            const playerSocket = [...gameSockets.values()].find(
               (s) => s.player.id === player.id
            );

            if (playerSocket) {
               playerSocket.emit(
                  "started-room",
                  socket.room!.game.serialize(player.index)
               );
            }
         }
      }
   });

   socket.on("bet-landlord", (bet: number) => {
      if (
         !socket.room ||
         socket.room.status !== RoomStatus.PLAYING ||
         socket.room.game.phase !== GamePhase.BIDDING
      )
         return;

      if (socket.room.game.current.id !== socket.player.id) {
         socket.emit("error", "Not your turn");
         return;
      }

      const result = socket.room.game.betLandlord(bet);

      if (result === undefined) {
         socket.emit("error", "Invalid bet");
         return;
      }

      io.to(socket.room.code).emit("p-bet-landlord", bet);

      if (result) {
         io.to(socket.room.code).emit(
            "p-became-landlord",
            socket.player.id,
            socket.room.game.bottom
         );
         socket.room.game.becomeLandlord();
      }
   });

   socket.on("play-cards", (cards: Card[]) => {
      if (
         !socket.room ||
         socket.room.status !== RoomStatus.PLAYING ||
         socket.room.game.phase !== GamePhase.PLAYING
      )
         return;

      const result = socket.room.game.playCards(cards);

      if (result === undefined) {
         socket.emit("error", "Cannot play these cards");
         return;
      }

      io.to(socket.room.code).emit("p-played-cards", cards);

      if (result) {
         const isLandlord = socket.player.id === socket.room.game.landlord?.id;
         const reason = isLandlord ? "Landlord victory!" : "Farmers victory!";

         io.to(socket.room.code).emit("ended-room", reason);
         socket.room.endRoom();
      }
   });
}

function createRoom(roomCode?: string): string | undefined {
   if (rooms.size >= 10_000) return;
   const code = roomCode || randomCode();
   const room = new Room(code);
   rooms.set(code, room);

   return code;
}

function joinRoom(socket: GameSocket, io: Server, code: string): void {
   const room = rooms.get(code);

   if (!room) {
      socket.emit("error", "Room not found");
      return;
   }

   socket.leave(MENU_ROOM);
   socket.join(code);
   socket.room = room;

   const playerInRoom = room.players.get(socket.player.id);
   if (playerInRoom) {
      playerInRoom.status = PlayerStatus.NOT_READY;
      socket.emit("joined-room", room.serialize());
      socket
         .to(socket.room.code)
         .emit("p-set-status", socket.player.id, PlayerStatus.NOT_READY);
   } else {
      socket.player.status = PlayerStatus.NOT_READY;
      room.addPlayer(socket.player);
      io.to(socket.room.code).emit(
         "p-joined-room",
         socket.player.id,
         socket.player.name
      );
      socket.emit("joined-room", room.serialize());
   }
}

function handlePlayerLeave(socket: GameSocket): void {
   const room = socket.room;
   if (!room) return;

   socket.leave(room.code);

   if (room.status === RoomStatus.LOBBY) handleLobbyPlayerLeave(socket, room);
   else handleGamePlayerDisconnect(socket, room);

   if (shouldDeleteRoom(room)) deleteRoom(room.code);
}

function handleLobbyPlayerLeave(socket: GameSocket, room: Room): void {
   room.removePlayer(socket.player.id);
   socket.to(room.code).emit("p-left-room", socket.player.id);
   emitRoomList();
}

function handleGamePlayerDisconnect(socket: GameSocket, room: Room): void {
   const player = room.players.get(socket.player.id);
   if (player) {
      player.status = PlayerStatus.DISCONNECTED;
      socket
         .to(room.code)
         .emit("p-set-status", socket.player.id, PlayerStatus.DISCONNECTED);
   }
}

function shouldDeleteRoom(room: Room): boolean {
   return room.allPlayersDisconnected();
}

function deleteRoom(roomCode: string): void {
   rooms.delete(roomCode);
   emitRoomList();
}

function randomCode(): string {
   const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
   let result = "";
   do {
      result = "";
      for (let index = 0; index < 4; index++)
         result += chars.charAt(Math.floor(Math.random() * chars.length));
   } while (rooms.has(result));

   return result;
}
