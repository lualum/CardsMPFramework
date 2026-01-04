import type { Card } from "../shared/card";
import type { SerializedGame } from "../shared/game";
import { Game } from "../shared/game";
import { Player, type PlayerStatus } from "../shared/player";
import { Room, RoomStatus, type SerializedRoom } from "../shared/room";
import {
   endGameUI,
   showRoomElements,
   startGameUI,
   updateUIAllChat,
   updateUIGame,
   updateUIPlayerList,
   updateUIPushChat,
} from "./game-ui";
import { gs } from "./session";
import { updateURL } from "./url";

export function initGameSocket(): void {
   gs.socket.on("sent-player", (name: string) => {
      gs.player.name = name;
   });

   gs.socket.on("joined-room", (raw: SerializedRoom) => {
      const room = Room.deserialize(raw);
      gs.room = room;
      gs.player = room.players.get(gs.player.id) ?? gs.player;
      showRoomElements();
      updateUIPlayerList();
      updateUIAllChat();
      updateUIGame();

      if (room.status === RoomStatus.PLAYING) startGameUI();
      else endGameUI();

      updateURL(room.code);
   });

   gs.socket.on("p-joined-room", (id: string, name: string) => {
      if (id === gs.player.id) return;
      gs.room.addPlayer(new Player(id, name));
      updateUIPlayerList();
   });

   gs.socket.on("p-left-room", (id: string) => {
      gs.room.removePlayer(id);
      updateUIPlayerList();
   });

   gs.socket.on("p-set-status", (id: string, status: PlayerStatus) => {
      const player = gs.room.getPlayer(id);
      if (!player) return;
      player.status = status;
      updateUIPlayerList();
   });

   gs.socket.on("started-room", (raw: SerializedGame) => {
      gs.room.game = Game.deserialize(raw);
      gs.player =
         gs.room.game.players.find((p) => p.id === gs.player.id) ?? gs.player;

      for (const player of gs.room.game.players.values())
         console.log(player.hand);

      startGameUI();
   });

   gs.socket.on("p-bet-landlord", (bet: number) => {
      gs.room.game.betLandlord(bet);
      updateUIGame();
   });

   gs.socket.on("p-became-landlord", (playerId: string, bottom: Card[]) => {
      gs.room.game.becomeLandlord(bottom);
      updateUIPushChat({
         id: "server",
         message: `${gs.room.players.get(playerId)?.name} is the landlord!`,
      });
   });

   gs.socket.on("p-played-cards", (cards: Card[]) => {
      gs.room.game.playCards(cards, false);

      updateUIGame();
   });

   gs.socket.on("ended-room", (reason: string) => {
      gs.room.endRoom();
      endGameUI();
      updateUIPushChat({
         id: "server",
         message: reason,
      });
   });

   gs.socket.on("p-sent-chat", (id: string, message: string) => {
      gs.room.chat.push(id, message);
      updateUIPushChat({ id, message });
   });
}
