import type { Card } from "./card";
import { Hand } from "./game";

export interface SerializedPlayer {
   id: string;
   name: string;
   status: PlayerStatus;
   hand: Card[];
   score: number;
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
   score: number = 0;
   hand: Hand = new Hand([]);

   constructor(
      id: string,
      name: string = "Player",
      status: PlayerStatus = PlayerStatus.NOT_READY
   ) {
      this.id = id;
      this.name = name;
      this.status = status;
   }

   serialize(): SerializedPlayer {
      return {
         id: this.id,
         name: this.name,
         status: this.status,
         hand: this.hand.cards,
         score: this.score,
      };
   }

   static deserialize(data: SerializedPlayer): Player {
      const player = new Player(data.id, data.name, data.status);
      player.hand = new Hand(data.hand);
      player.score = data.score;
      return player;
   }
}
