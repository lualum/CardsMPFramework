import type { Card } from "./card";
import { Hand } from "./game";

export enum PlayerStatus {
   NOT_READY = "not_ready",
   READY = "ready",
   DISCONNECTED = "disconnected",
}

export interface SerializedPlayer {
   id: string;
   name: string;
   hand: Card[];
   status: PlayerStatus;
   gameIndex?: number;
}

export class Player {
   id: string;
   name: string;
   hand: Hand;
   status: PlayerStatus;
   index: number | undefined;

   constructor(id: string, name?: string) {
      this.id = id;
      this.name = name || id;
      this.hand = new Hand([]);
      this.status = PlayerStatus.NOT_READY;
      this.index = undefined;
   }

   serialize(hideHand = false): SerializedPlayer {
      return {
         id: this.id,
         name: this.name,
         hand: hideHand
            ? this.hand.cards.map(() => ({ type: "Flipped" }))
            : this.hand.cards,
         status: this.status,
         gameIndex: this.index,
      };
   }

   static deserialize(data: SerializedPlayer): Player {
      const player = new Player(data.id, data.name);
      player.hand = new Hand(data.hand);
      player.status = data.status;
      player.index = data.gameIndex;
      return player;
   }
}
