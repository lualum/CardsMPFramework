export type Suit = "h" | "d" | "c" | "s";
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export type Playing = {
   type: "Playing";
   suit: Suit;
   rank: Rank;
};

export type Joker = {
   type: "Joker";
   color: "RED" | "BLACK";
};

export type Flipped = {
   type: "Flipped";
};

export type Card = Playing | Joker | Flipped;
