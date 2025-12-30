import { Chat } from "./chat";
import { Player } from "./player";

export enum RoomStatus {
   LOBBY = "lobby",
   PLAYING = "playing",
}

export interface RoomListing {
   code: string;
   numPlayers: number;
}

export interface SerializedGame {
   deck: Card[];
   landlordCards: Card[];
   currentPlayerId: string | undefined;
   landlordId: string | undefined;
   lastPlay: Play | undefined;
   phase: GamePhase;
   passCount: number;
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
      if (this.players.size !== 3) return false;

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

type Suit = "h" | "d" | "c" | "s";
type Rank =
   | "a"
   | "2"
   | "3"
   | "4"
   | "5"
   | "6"
   | "7"
   | "8"
   | "9"
   | "t"
   | "j"
   | "q"
   | "k";

export type Card =
   | { state: "Revealed"; suit: Suit; rank: Rank }
   | { state: "Joker"; color: "RED" | "BLACK" };

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
      if (card.state === "Joker") return card.color === "BLACK" ? 53 : 54;

      const rankValues: Record<Rank, number> = {
         "3": 3,
         "4": 4,
         "5": 5,
         "6": 6,
         "7": 7,
         "8": 8,
         "9": 9,
         t: 10,
         j: 11,
         q: 12,
         k: 13,
         a: 14,
         "2": 15,
      };
      return rankValues[card.rank];
   }

   remove(cards: Card[]): void {
      for (const card of cards) {
         const index = this.cards.findIndex((c) => Hand.cardsEqual(c, card));
         if (index !== -1) this.cards.splice(index, 1);
      }
   }

   static cardsEqual(a: Card, b: Card): boolean {
      if (a.state === "Joker" && b.state === "Joker")
         return a.color === b.color;

      if (a.state === "Revealed" && b.state === "Revealed")
         return a.suit === b.suit && a.rank === b.rank;

      return false;
   }
}

export enum PlayerStatus {
   READY = "ready",
   NOT_READY = "not-ready",
   DISCONNECTED = "disconnected",
}

export interface SerializedPlayer {
   id: string;
   name: string;
   status: PlayerStatus;
   hand: Card[];
}

export class Game {
   deck: Card[] = [];
   landlordCards: Card[] = [];
   currentPlayerId: string | undefined = undefined;
   landlordId: string | undefined = undefined;
   lastPlay: Play | undefined = undefined;
   phase: GamePhase = GamePhase.BIDDING;
   passCount: number = 0;

   constructor() {}

   serialize(): SerializedGame {
      return {
         deck: this.deck,
         landlordCards: this.landlordCards,
         currentPlayerId: this.currentPlayerId,
         landlordId: this.landlordId,
         lastPlay: this.lastPlay,
         phase: this.phase,
         passCount: this.passCount,
      };
   }

   static deserialize(data: SerializedGame): Game {
      const game = new Game();
      game.deck = data.deck;
      game.landlordCards = data.landlordCards;
      game.currentPlayerId = data.currentPlayerId;
      game.landlordId = data.landlordId;
      game.lastPlay = data.lastPlay;
      game.phase = data.phase;
      game.passCount = data.passCount;
      return game;
   }

   startGame(players: Player[]): void {
      if (players.length !== 3) return;

      this.initializeDeck();
      this.shuffleDeck();
      this.dealCards(players);
      this.phase = GamePhase.BIDDING;
      this.currentPlayerId = players[0].id;
   }

   private initializeDeck(): void {
      this.deck = [];
      const suits: Suit[] = ["h", "d", "c", "s"];
      const ranks: Rank[] = [
         "3",
         "4",
         "5",
         "6",
         "7",
         "8",
         "9",
         "t",
         "j",
         "q",
         "k",
         "a",
         "2",
      ];

      for (const suit of suits) {
         for (const rank of ranks)
            this.deck.push({ state: "Revealed", suit, rank });
      }

      this.deck.push(
         { state: "Joker", color: "BLACK" },
         { state: "Joker", color: "RED" }
      );
   }

   private shuffleDeck(): void {
      for (let index = this.deck.length - 1; index > 0; index--) {
         const index_ = Math.floor(Math.random() * (index + 1));
         [this.deck[index], this.deck[index_]] = [
            this.deck[index_],
            this.deck[index],
         ];
      }
   }

   private dealCards(players: Player[]): void {
      this.landlordCards = this.deck.slice(0, 3);
      let cardIndex = 3;

      // Clear all hands
      for (const player of players) player.hand = new Hand([]);

      // Deal 17 cards to each player
      for (let index = 0; index < 17; index++) {
         for (const player of players)
            player.hand.cards.push(this.deck[cardIndex++]);
      }

      // Sort each player's hand
      for (const player of players) player.hand.sort();
   }

   becomeLandlord(player: Player): void {
      if (this.phase !== GamePhase.BIDDING) return;

      this.landlordId = player.id;
      player.hand.cards.push(...this.landlordCards);
      player.hand.sort();
      this.phase = GamePhase.PLAYING;
      this.currentPlayerId = player.id;
      this.lastPlay = undefined;
      this.passCount = 0;
   }

   playCards(player: Player, cards: Card[], players: Player[]): boolean {
      if (this.phase !== GamePhase.PLAYING) return false;
      if (player.id !== this.currentPlayerId) return false;

      const play = Game.validatePlay(cards);
      if (!play) return false;

      if (
         this.lastPlay !== undefined &&
         this.passCount < 2 &&
         !Game.canBeat(play, this.lastPlay)
      )
         return false;

      player.hand.remove(cards);
      this.lastPlay = play;
      this.passCount = 0;

      if (player.hand.cards.length === 0) {
         this.phase = GamePhase.FINISHED;
         return true;
      }

      // Move to next player
      const currentIndex = players.findIndex(
         (p) => p.id === this.currentPlayerId
      );
      const nextIndex = (currentIndex + 1) % players.length;
      this.currentPlayerId = players[nextIndex].id;
      return true;
   }

   pass(player: Player, players: Player[]): boolean {
      if (this.phase !== GamePhase.PLAYING) return false;
      if (player.id !== this.currentPlayerId) return false;
      if (this.lastPlay === undefined) return false;

      this.passCount++;

      if (this.passCount >= 2) {
         this.lastPlay = undefined;
         this.passCount = 0;
      }

      // Move to next player
      const currentIndex = players.findIndex(
         (p) => p.id === this.currentPlayerId
      );
      const nextIndex = (currentIndex + 1) % players.length;
      this.currentPlayerId = players[nextIndex].id;
      return true;
   }

   static validatePlay(cards: Card[]): Play | undefined {
      if (cards.length === 0) return undefined;

      const sorted = [...cards].sort(
         (a, b) => Hand.getCardValue(a) - Hand.getCardValue(b)
      );

      // Rocket: Both Jokers
      if (
         sorted.length === 2 &&
         sorted[0].state === "Joker" &&
         sorted[1].state === "Joker"
      )
         return { cards, type: PlayType.ROCKET, value: 1000 };

      const rankCounts = Game.countRanks(sorted);
      const counts = Object.values(rankCounts);
      const uniqueRanks = Object.keys(rankCounts);

      // Bomb: 4 of a kind
      if (sorted.length === 4 && counts.length === 1 && counts[0] === 4) {
         return {
            cards,
            type: PlayType.BOMB,
            value: 100 + Hand.getCardValue(sorted[0]),
         };
      }

      // Solo
      if (sorted.length === 1) {
         return {
            cards,
            type: PlayType.SOLO,
            value: Hand.getCardValue(sorted[0]),
         };
      }

      // Pair
      if (sorted.length === 2 && counts.length === 1 && counts[0] === 2) {
         return {
            cards,
            type: PlayType.PAIR,
            value: Hand.getCardValue(sorted[0]),
         };
      }

      // Triple
      if (sorted.length === 3 && counts.length === 1 && counts[0] === 3) {
         return {
            cards,
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
            cards,
            type: PlayType.TRIPLE_WITH_SINGLE,
            value: Hand.getCardValue(
               sorted.find(
                  (c) =>
                     (c.state === "Revealed" && c.rank === tripleRank) ||
                     c.state === "Joker"
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
            cards,
            type: PlayType.TRIPLE_WITH_PAIR,
            value: Hand.getCardValue(
               sorted.find(
                  (c) =>
                     (c.state === "Revealed" && c.rank === tripleRank) ||
                     c.state === "Joker"
               )!
            ),
         };
      }

      // Straight: 5+ consecutive cards
      if (sorted.length >= 5 && Game.isStraight(sorted, 1)) {
         return {
            cards,
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
            cards,
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
            cards,
            type: PlayType.TRIPLE_STRAIGHT,
            value: Hand.getCardValue(sorted[0]),
         };
      }

      return undefined;
   }

   private static countRanks(cards: Card[]): Record<string, number> {
      const counts: Record<string, number> = {};
      for (const card of cards) {
         const key = card.state === "Joker" ? `joker_${card.color}` : card.rank;
         counts[key] = (counts[key] || 0) + 1;
      }
      return counts;
   }

   private static isStraight(sorted: Card[], groupSize: number): boolean {
      if (sorted.length % groupSize !== 0) return false;
      if (sorted.some((c) => c.state === "Joker")) return false;

      const numberGroups = sorted.length / groupSize;
      for (let index = 0; index < numberGroups; index++) {
         const groupCards = sorted.slice(
            index * groupSize,
            (index + 1) * groupSize
         );
         if (groupCards.some((c) => c.state !== "Revealed")) return false;

         const firstCard = groupCards[0] as Extract<
            Card,
            { state: "Revealed" }
         >;
         if (
            !groupCards.every(
               (c) => c.state === "Revealed" && c.rank === firstCard.rank
            )
         )
            return false;

         if (index > 0) {
            const previousCard = sorted[(index - 1) * groupSize] as Extract<
               Card,
               { state: "Revealed" }
            >;
            const expectedValue = Hand.getCardValue(previousCard) + 1;
            const actualValue = Hand.getCardValue(firstCard);

            if (actualValue !== expectedValue || actualValue >= 15)
               return false; // No 2 or Aces in straights
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
