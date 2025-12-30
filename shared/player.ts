import type { Card } from "./room";
import { Hand } from "./room";

export interface SerializedPlayer {
   id: string;
   name: string;
   status: PlayerStatus;
   hand: Card[];
}

export enum PlayerStatus {
   READY = "ready",
   NOT_READY = "not-ready",
   DISCONNECTED = "disconnected",
}

export class Player {
   id: string;
   name: string;
   status: PlayerStatus;
   hand: Hand;

   constructor(
      id: string,
      name: string = "Player",
      status: PlayerStatus = PlayerStatus.NOT_READY
   ) {
      this.id = id;
      this.name = name;
      this.status = status;
      this.hand = new Hand([]);
   }

   serialize(): SerializedPlayer {
      return {
         id: this.id,
         name: this.name,
         status: this.status,
         hand: this.hand.cards,
      };
   }

   static deserialize(data: SerializedPlayer): Player {
      const player = new Player(data.id, data.name, data.status);
      player.hand = new Hand(data.hand);
      return player;
   }
}
