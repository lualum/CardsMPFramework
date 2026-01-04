import type { Card, Rank, Suit } from "./card";
import type { SerializedPlayer } from "./player";
import { Player } from "./player";

export interface SerializedGame {
   bottom: Card[];
   currentIndex: number;
   lastPlay: Play | undefined;
   phase: GamePhase;
   players: SerializedPlayer[];
   bet: number;
   landlordIndex: number | undefined;
}

export class Game {
   bottom: Card[] = [];
   players: Player[] = [];
   currentIndex: number = 0;
   bet: number = 0;
   landlordIndex: number | undefined = undefined;
   lastPlay: Play | undefined = undefined;
   phase: GamePhase = GamePhase.FINISHED;

   constructor() {}

   serialize(toIndex?: number): SerializedGame {
      if (toIndex === undefined) {
         return {
            bottom: this.bottom,
            currentIndex: this.currentIndex,
            lastPlay: this.lastPlay,
            phase: this.phase,
            players: this.players.map((p) => p.serialize(false)),
            bet: this.bet,
            landlordIndex: this.landlordIndex,
         };
      }

      // if toIndex !== index, send player with hand replaced with flipped cards
      return {
         bottom: this.bottom,
         currentIndex: this.currentIndex,
         lastPlay: this.lastPlay,
         phase: this.phase,
         players: this.players.map((player, index) =>
            player.serialize(index !== toIndex)
         ),
         bet: this.bet,
         landlordIndex: this.landlordIndex,
      };
   }

   static deserialize(data: SerializedGame): Game {
      const game = new Game();
      game.bottom = data.bottom;
      game.currentIndex = data.currentIndex;
      game.lastPlay = data.lastPlay;
      game.phase = data.phase;
      game.players = data.players.map((p) => Player.deserialize(p));
      game.bet = data.bet;
      game.landlordIndex = data.landlordIndex;
      return game;
   }

   get current(): Player {
      return this.players[this.currentIndex];
   }

   get landlord(): Player | undefined {
      if (this.landlordIndex === undefined) return undefined;
      return this.players[this.landlordIndex];
   }

   // Server Only
   startGame(players: Player[]): void {
      this.players = [...players];

      for (const [index, player] of this.players.entries())
         player.index = index;

      this.initializeDeck();
      this.shuffleDeck();
      this.dealCards();
      this.phase = GamePhase.BIDDING;
      this.currentIndex = 0;
   }

   // Server Only
   private initializeDeck(): void {
      this.bottom = [];
      const suits: Suit[] = ["h", "d", "c", "s"];
      const ranks: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

      for (const suit of suits) {
         for (const rank of ranks)
            this.bottom.push({ type: "Playing", suit, rank });
      }

      this.bottom.push(
         { type: "Joker", color: "BLACK" },
         { type: "Joker", color: "RED" }
      );
   }

   // Server Only
   private shuffleDeck(): void {
      for (let index = this.bottom.length - 1; index > 0; index--) {
         const index_ = Math.floor(Math.random() * (index + 1));
         [this.bottom[index], this.bottom[index_]] = [
            this.bottom[index_],
            this.bottom[index],
         ];
      }
   }

   // Server Only
   private dealCards(): void {
      let cardIndex = 3;

      for (const player of this.players) player.hand = new Hand([]);
      for (let index = 0; index < 17; index++) {
         // 17 cards per player in DDZ
         for (const player of this.players)
            player.hand.cards.push(this.bottom[cardIndex++]);
      }

      for (const player of this.players) player.hand.sort();
   }

   betLandlord(bet: number): boolean | undefined {
      if (bet > this.bet) {
         this.bet = bet;
         this.landlordIndex = this.currentIndex;
         if (bet === 3) return true;
      }

      // Move to next player
      this.currentIndex = (this.currentIndex + 1) % this.players.length;

      // If the next player is landlord, betting ends
      return this.currentIndex === this.landlordIndex;
   }

   becomeLandlord(bottom = this.bottom): void {
      if (this.phase !== GamePhase.BIDDING) return;

      const player = this.players[this.currentIndex];

      player.hand.cards.push(...bottom);
      player.hand.sort();

      this.bottom = [];
      this.phase = GamePhase.PLAYING;
      this.currentIndex = this.currentIndex;
      this.lastPlay = undefined;
      this.landlordIndex = this.currentIndex;
   }

   playCards(cards: Card[], check = true): boolean | undefined {
      if (this.phase !== GamePhase.PLAYING) return undefined;

      const player = this.players[this.currentIndex];

      if (!check) {
         player.hand.remove(cards, false);
         return player.hand.cards.length === 0;
      }

      if (cards.length > 0) {
         const playType = Game.validatePlayType(cards);
         if (!playType) return undefined;

         const play = {
            cards,
            type: playType.type,
            value: playType.value,
            playerIndex: this.currentIndex,
         };

         if (this.lastPlay && !Game.canBeat(play, this.lastPlay))
            return undefined;

         player.hand.remove(cards, check);
         this.lastPlay = play;

         if (player.hand.cards.length === 0) {
            this.phase = GamePhase.FINISHED;
            return true;
         }
      }

      // Move to next player logic
      this.currentIndex = (this.currentIndex + 1) % this.players.length;

      if (this.lastPlay && this.lastPlay.playerIndex === this.currentIndex)
         this.lastPlay = undefined;

      return false;
   }

   static validatePlayType(
      cards: Card[]
   ): { type: PlayType; value: number } | undefined {
      if (cards.length === 0) return undefined;

      const sorted = cards.toSorted(
         (a, b) => Hand.getCardValue(a) - Hand.getCardValue(b)
      );

      // Rocket: Both Jokers
      if (
         sorted.length === 2 &&
         sorted[0].type === "Joker" &&
         sorted[1].type === "Joker"
      ) {
         return {
            type: PlayType.ROCKET,
            value: 1000,
         };
      }

      const rankCounts = Game.countRanks(sorted);
      const counts = Object.values(rankCounts);
      const uniqueRanks = Object.keys(rankCounts);

      // Bomb: 4 of a kind
      if (sorted.length === 4 && counts.length === 1 && counts[0] === 4) {
         return {
            type: PlayType.BOMB,
            value: 100 + Hand.getCardValue(sorted[0]),
         };
      }

      // Solo
      if (sorted.length === 1) {
         return {
            type: PlayType.SOLO,
            value: Hand.getCardValue(sorted[0]),
         };
      }

      // Pair
      if (sorted.length === 2 && counts.length === 1 && counts[0] === 2) {
         return {
            type: PlayType.PAIR,
            value: Hand.getCardValue(sorted[0]),
         };
      }

      // Triple
      if (sorted.length === 3 && counts.length === 1 && counts[0] === 3) {
         return {
            type: PlayType.TRIPLE,
            value: Hand.getCardValue(sorted[0]),
         };
      }

      // Triple with single
      if (
         sorted.length === 4 &&
         counts.length === 2 &&
         counts.includes(3) &&
         counts.includes(1)
      ) {
         const tripleRank = uniqueRanks.find((r) => rankCounts[r] === 3)!;
         return {
            type: PlayType.TRIPLE_WITH_SINGLE,
            value: Hand.getCardValue(
               sorted.find(
                  (c) =>
                     (c.type === "Playing" && c.rank === Number(tripleRank)) ||
                     c.type === "Joker"
               )!
            ),
         };
      }

      // Triple with pair
      if (
         sorted.length === 5 &&
         counts.length === 2 &&
         counts.includes(3) &&
         counts.includes(2)
      ) {
         const tripleRank = uniqueRanks.find((r) => rankCounts[r] === 3)!;
         return {
            type: PlayType.TRIPLE_WITH_PAIR,
            value: Hand.getCardValue(
               sorted.find(
                  (c) =>
                     (c.type === "Playing" && c.rank === Number(tripleRank)) ||
                     c.type === "Joker"
               )!
            ),
         };
      }

      // Straight: 5+ consecutive cards
      if (sorted.length >= 5 && Game.isStraight(sorted, 1)) {
         return {
            type: PlayType.STRAIGHT,
            value: Hand.getCardValue(sorted[0]),
         };
      }

      // Pair straight: 3+ consecutive pairs
      if (
         sorted.length >= 6 &&
         sorted.length % 2 === 0 &&
         Game.isStraight(sorted, 2)
      ) {
         return {
            type: PlayType.PAIR_STRAIGHT,
            value: Hand.getCardValue(sorted[0]),
         };
      }

      // Triple straight (airplane): 2+ consecutive triples
      if (
         sorted.length >= 6 &&
         sorted.length % 3 === 0 &&
         Game.isStraight(sorted, 3)
      ) {
         return {
            type: PlayType.TRIPLE_STRAIGHT,
            value: Hand.getCardValue(sorted[0]),
         };
      }

      return undefined;
   }

   private static countRanks(cards: Card[]): Record<string, number> {
      const counts: Record<string, number> = {};
      for (const card of cards) {
         const key =
            card.type === "Joker"
               ? `joker_${card.color}`
               : card.type === "Playing"
                 ? String(card.rank)
                 : "flipped";
         counts[key] = (counts[key] || 0) + 1;
      }
      return counts;
   }

   private static isStraight(sorted: Card[], groupSize: number): boolean {
      if (sorted.length % groupSize !== 0) return false;

      for (const card of sorted) if (card.type !== "Playing") return false;

      // Now TypeScript knows all cards are Playing cards
      const playingCards = sorted as Extract<Card, { type: "Playing" }>[];

      const numberGroups = playingCards.length / groupSize;
      for (let index = 0; index < numberGroups; index++) {
         const groupCards = playingCards.slice(
            index * groupSize,
            (index + 1) * groupSize
         );

         const firstCard = groupCards[0];

         for (const card of groupCards)
            if (card.rank !== firstCard.rank) return false;

         if (index > 0) {
            const previousCard = playingCards[(index - 1) * groupSize];
            const expectedValue = Hand.getCardValue(previousCard) + 1;
            const actualValue = Hand.getCardValue(firstCard);

            if (actualValue !== expectedValue || actualValue >= 13)
               return false;
         }
      }

      return numberGroups >= (groupSize === 1 ? 5 : groupSize === 2 ? 3 : 2);
   }

   static canBeat(play: Play, lastPlay: Play): boolean {
      // Rocket beats everything
      if (play.type === PlayType.ROCKET) return true;

      // Bomb beats everything except Rocket and higher Bombs
      if (play.type === PlayType.BOMB) {
         if (lastPlay.type === PlayType.ROCKET) return false;
         if (lastPlay.type === PlayType.BOMB)
            return play.value > lastPlay.value;

         return true;
      }

      // Normal plays must match type and have higher value
      if (play.type !== lastPlay.type) return false;
      if (play.cards.length !== lastPlay.cards.length) return false;

      return play.value > lastPlay.value;
   }
}

export enum GamePhase {
   BIDDING = "bidding",
   PLAYING = "playing",
   FINISHED = "finished",
}

export enum PlayType {
   SOLO = "solo",
   PAIR = "pair",
   TRIPLE = "triple",
   TRIPLE_WITH_SINGLE = "triple_with_single",
   TRIPLE_WITH_PAIR = "triple_with_pair",
   STRAIGHT = "straight",
   PAIR_STRAIGHT = "pair_straight",
   TRIPLE_STRAIGHT = "triple_straight",
   AIRPLANE_WITH_SINGLES = "airplane_with_singles",
   AIRPLANE_WITH_PAIRS = "airplane_with_pairs",
   QUAD_WITH_SINGLES = "quad_with_singles",
   QUAD_WITH_PAIRS = "quad_with_pairs",
   BOMB = "bomb",
   ROCKET = "rocket",
}

export interface Play {
   cards: Card[];
   type: PlayType;
   value: number;
   playerIndex: number;
}

export class Hand {
   cards: Card[] = [];

   constructor(cards: Card[]) {
      this.cards = cards;
   }

   sort(): void {
      this.cards.sort((a, b) => {
         const aValue = Hand.getCardValue(a);
         const bValue = Hand.getCardValue(b);
         return aValue - bValue;
      });
   }

   static getCardValue(card: Card): number {
      switch (card.type) {
         case "Joker": {
            return card.color === "BLACK" ? 53 : 54;
         }
         case "Playing": {
            return card.rank === 2 ? 20 : card.rank === 1 ? 19 : card.rank;
         }
         case "Flipped": {
            return 55;
         }
      }
   }

   remove(cards: Card[], check = true): void {
      for (const card of cards) {
         const index = this.cards.findIndex((c) => Hand.cardsEqual(c, card));
         if (index !== -1 || !check) this.cards.splice(index, 1);
      }
   }

   static cardsEqual(a: Card, b: Card): boolean {
      if (a.type === "Joker" && b.type === "Joker") return a.color === b.color;

      if (a.type === "Playing" && b.type === "Playing")
         return a.suit === b.suit && a.rank === b.rank;

      return false;
   }
}
