import { Player, type PlayerStatus } from "../shared/player";
import {
   Game,
   Room,
   RoomStatus,
   type Card,
   type Play,
   type SerializedGame,
   type SerializedRoom,
} from "../shared/room";
import {
   endGameUI,
   showRoomElements,
   startGameUI,
   updateUIAllChat,
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
      updateUIGameState();

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
      gs.room.status = RoomStatus.PLAYING;
      gs.room.game = Game.deserialize(raw);

      // Update player hands from the game state
      const players = [...gs.room.players.values()];
      for (const player of players) player.hand.sort();

      startGameUI();
      updateUIGameState();
   });

   gs.socket.on(
      "p-became-landlord",
      (playerId: string, landlordCards: Card[]) => {
         const player = gs.room.getPlayer(playerId);
         if (player) {
            player.hand.cards.push(...landlordCards);
            player.hand.sort();
         }
         gs.room.game.landlordId = playerId;
         gs.room.game.currentPlayerId = playerId;
         updateUIGameState();
         updateUIPushChat({
            id: "server",
            message: `${player?.name} became the landlord!`,
         });
      }
   );

   gs.socket.on(
      "p-played-cards",
      (playerId: string, cards: Card[], play: Play) => {
         const player = gs.room.getPlayer(playerId);
         if (player) player.hand.remove(cards);

         gs.room.game.lastPlay = play;
         gs.room.game.passCount = 0;

         // Move to next player
         const players = [...gs.room.players.values()];
         const currentIndex = players.findIndex((p) => p.id === playerId);
         const nextIndex = (currentIndex + 1) % players.length;
         gs.room.game.currentPlayerId = players[nextIndex].id;

         updateUIGameState();
         updateUIPushChat({
            id: playerId,
            message: `played ${cards.length} card(s) - ${play.type}`,
         });
      }
   );

   gs.socket.on("p-passed", (playerId: string) => {
      gs.room.game.passCount++;

      // Check if round resets (2 passes)
      if (gs.room.game.passCount >= 2) {
         gs.room.game.lastPlay = undefined;
         gs.room.game.passCount = 0;
         updateUIPushChat({
            id: "server",
            message: "New round - play any valid combination!",
         });
      }

      // Move to next player
      const players = [...gs.room.players.values()];
      const currentIndex = players.findIndex((p) => p.id === playerId);
      const nextIndex = (currentIndex + 1) % players.length;
      gs.room.game.currentPlayerId = players[nextIndex].id;

      updateUIGameState();
      updateUIPushChat({
         id: playerId,
         message: "passed",
      });
   });

   gs.socket.on("ended-room", (winnerId: string, reason: string) => {
      const winner = gs.room.getPlayer(winnerId);
      gs.room.endRoom();
      endGameUI();
      updateUIPushChat({
         id: "server",
         message: `${winner?.name} won! ${reason}`,
      });
   });

   gs.socket.on("p-sent-chat", (id: string, message: string) => {
      gs.room.chat.push(id, message);
      updateUIPushChat({ id, message });
   });
}

function updateUIGameState(): void {
   // Update all UI elements related to game state
   // This would include:
   // - Current player indicator
   // - Player hands (only show own hand fully, others show card count)
   // - Last played cards
   // - Landlord indicator
   // - Pass count
   // - Game phase (bidding vs playing)

   // TODO: Implement based on your UI structure
   console.log("Game state updated:", {
      phase: gs.room.game.phase,
      currentPlayer: gs.room.game.currentPlayerId,
      landlord: gs.room.game.landlordId,
      lastPlay: gs.room.game.lastPlay,
      passCount: gs.room.game.passCount,
   });
}
