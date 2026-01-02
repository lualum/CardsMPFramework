import { Chat } from "./chat";
import type { SerializedGame } from "./game";
import { Game, Hand } from "./game";
import type { SerializedPlayer } from "./player";
import { Player, PlayerStatus } from "./player";

export enum RoomStatus {
   LOBBY = "lobby",
   PLAYING = "playing",
}

export interface RoomListing {
   code: string;
   numPlayers: number;
}

export interface SerializedRoom {
   code: string;
   status: RoomStatus;
   game: SerializedGame;
   chat: string;
   players: Record<string, SerializedPlayer>;
}

export class Room {
   code: string;
   players: Map<string, Player>;
   status: RoomStatus;
   game: Game;
   chat: Chat;

   constructor(code: string) {
      this.code = code;
      this.players = new Map();
      this.status = RoomStatus.LOBBY;
      this.game = new Game();
      this.chat = new Chat();
   }

   serialize(): SerializedRoom {
      const serializedPlayers: Record<string, SerializedPlayer> = {};
      for (const [id, player] of this.players.entries())
         serializedPlayers[id] = player.serialize();

      return {
         code: this.code,
         status: this.status,
         game: this.game.serialize(),
         chat: this.chat.serialize(),
         players: serializedPlayers,
      };
   }

   static deserialize(data: SerializedRoom): Room {
      const room = new Room(data.code);
      room.status = data.status;
      room.game = Game.deserialize(data.game);
      room.chat = Chat.deserialize(data.chat);

      const playersData = data.players;
      for (const [id, playerData] of Object.entries(playersData))
         room.players.set(id, Player.deserialize(playerData));

      return room;
   }

   getRoomListing(): RoomListing {
      return {
         code: this.code,
         numPlayers: this.players.size,
      };
   }

   addPlayer(player: Player): void {
      this.players.set(player.id, player);
   }

   removePlayer(id: string): void {
      this.players.delete(id);
   }

   getPlayer(id: string): Player | undefined {
      return this.players.get(id);
   }

   allPlayersDisconnected(): boolean {
      if (this.players.size === 0) return true;
      for (const player of this.players.values())
         if (player.status !== PlayerStatus.DISCONNECTED) return false;

      return true;
   }

   tryStartRoom(): boolean {
      if (this.status !== RoomStatus.LOBBY) return false;
      if (this.players.size < 2) return false;

      for (const player of this.players.values())
         if (player.status !== PlayerStatus.READY) return false;

      this.status = RoomStatus.PLAYING;
      this.game.startGame([...this.players.values()]);

      return true;
   }

   endRoom(): void {
      this.status = RoomStatus.LOBBY;

      for (const player of this.players.values()) {
         if (player.status === PlayerStatus.DISCONNECTED) {
            this.removePlayer(player.id);
         } else {
            player.status = PlayerStatus.NOT_READY;
            player.hand = new Hand([]);
         }
      }
   }
}
