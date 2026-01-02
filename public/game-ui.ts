// game-ui.ts
import type { Card } from "../shared/card";
import type { ChatMessage } from "../shared/chat";
import { PlayerStatus } from "../shared/player";
import {
   clearCardSelection,
   disposeCardUI,
   getSelectedCardsFromUI,
   initCardUI,
   updateCardDisplay,
} from "./card-three-ui";
import { leaveRoom } from "./menu-ui";
import { gs } from "./session";

let pingIntervalID: NodeJS.Timeout;
let pingStartTime: number = 0;

export function initGameControls(): void {
   const leaveGameButton = document.querySelector("#leave-game-btn");
   leaveGameButton?.addEventListener("click", () => {
      leaveRoom();
      disposeCardUI();
   });

   const chatInput = document.querySelector("#chat-input");
   chatInput?.addEventListener("keypress", (event: Event) => {
      const keyEvent = event as KeyboardEvent;
      if (keyEvent.key === "Enter") sendChatMessage();
   });

   // Prevent chat input from triggering keyboard shortcuts
   chatInput?.addEventListener("keydown", (event: Event) => {
      event.stopPropagation();
   });

   // Add play cards button event listener
   const playCardsButton = document.querySelector("#play-cards-btn");
   playCardsButton?.addEventListener("click", () => {
      handlePlayCards();
   });

   // Add pass button event listener
   const passButton = document.querySelector("#pass-btn");
   passButton?.addEventListener("click", () => {
      handlePass();
   });

   // Add bid buttons
   const bid1Button = document.querySelector("#bid-1-btn");
   const bid2Button = document.querySelector("#bid-2-btn");
   const bid3Button = document.querySelector("#bid-3-btn");
   const bidPassButton = document.querySelector("#bid-pass-btn");

   bid1Button?.addEventListener("click", () => handleBid(1));
   bid2Button?.addEventListener("click", () => handleBid(2));
   bid3Button?.addEventListener("click", () => handleBid(3));
   bidPassButton?.addEventListener("click", () => handleBid(0));

   document.addEventListener("keydown", (event: Event) => {
      const keyEvent = event as KeyboardEvent;

      // Check if user is typing in an input or textarea
      const target = keyEvent.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      // Space to play selected cards
      if (keyEvent.key === " " || keyEvent.key === "Enter") {
         keyEvent.preventDefault();
         handlePlayCards();
      }

      // P to pass
      if (keyEvent.key === "p" || keyEvent.key === "P") {
         keyEvent.preventDefault();
         handlePass();
      }
   });
}

// MARK: Game Actions

function handlePlayCards(): void {
   const selectedCards = getSelectedCardsFromUI();

   if (selectedCards.length === 0) {
      showNotification("Please select cards to play");
      return;
   }

   // Emit to server
   gs.socket.emit("play-cards", selectedCards);
   clearCardSelection();
}

function handlePass(): void {
   gs.socket.emit("play-cards", []);
   clearCardSelection();
}

function handleBid(amount: number): void {
   gs.socket.emit("bid", amount);
}

function isPlayersTurn(): boolean {
   return gs.room.game.current.id === gs.player.id;
}

// MARK: Ping Indicator

function initPingIndicator(): void {
   gs.socket.on("pong", () => {
      const pingTime = Date.now() - pingStartTime;
      updatePingDisplay(pingTime);
   });

   startPingUpdates();
}

function updatePingDisplay(ping: number): void {
   const ranges = [
      { max: 50, bars: 5, color: "var(--green)" },
      { max: 100, bars: 4, color: "var(--green-yellow)" },
      { max: 150, bars: 3, color: "var(--yellow)" },
      { max: 250, bars: 2, color: "var(--yellow-red)" },
      { max: Infinity, bars: 1, color: "var(--red)" },
   ];

   const foundRange = ranges.find((r) => ping < r.max);
   if (!foundRange) return;

   const { bars: activeBars, color } = foundRange;

   // Update bar colors
   const bars = document.querySelectorAll(".ping-bar");
   for (const [index, bar] of bars.entries()) {
      const barElement = bar as HTMLElement;
      if (index < activeBars) {
         barElement.style.backgroundColor = color;
         barElement.style.opacity = "1";
      } else {
         barElement.style.backgroundColor = "var(--background)";
         barElement.style.opacity = "0.3";
      }
   }
}

function sendPing(): void {
   pingStartTime = Date.now();
   gs.socket.emit("ping");
}

export function startPingUpdates(): void {
   stopPingUpdates();
   sendPing();
   pingIntervalID = globalThis.setInterval(() => {
      sendPing();
   }, 5000);
}

export function stopPingUpdates(): void {
   clearInterval(pingIntervalID);
}

// MARK: Room UI

export function showRoomElements(): void {
   const gameScreen = document.querySelector("#game") as HTMLDivElement;
   for (const screen of document.querySelectorAll(".screen"))
      screen.classList.add("hidden");

   gameScreen.classList.remove("hidden");

   const gameRoomCode = document.querySelector(
      "#game-room-code"
   ) as HTMLSpanElement;
   gameRoomCode.textContent = gs.room.code || "";

   // Initialize Three.js card UI
   initCardUI();

   initPingIndicator();

   // Reset buttons to initial state
   resetGameButtons();
}

export function updateReadyButton(): void {
   const readyButton = document.querySelector(
      "#ready-btn"
   ) as HTMLButtonElement;

   if (gs.player.status === PlayerStatus.READY) {
      readyButton.textContent = "Not Ready";
      readyButton.classList.add("ready");
   } else {
      readyButton.textContent = "Ready";
      readyButton.classList.remove("ready");
   }
}

function resetGameButtons(): void {
   const readyButton = document.querySelector(
      "#ready-btn"
   ) as HTMLButtonElement;
   const playCardsButton = document.querySelector(
      "#play-cards-btn"
   ) as HTMLButtonElement;
   const passButton = document.querySelector("#pass-btn") as HTMLButtonElement;
   const biddingSection = document.querySelector(
      "#bidding-section"
   ) as HTMLDivElement;

   readyButton.style.display = "block";
   playCardsButton.style.display = "none";
   passButton.style.display = "none";
   biddingSection.style.display = "none";
}

export function updateUIPlayerList(): void {
   const playerList = document.querySelector("#player-list");
   if (playerList) {
      playerList.innerHTML = "";
      for (const [id, player] of gs.room.players) {
         const playerDiv = document.createElement("div");
         playerDiv.className = "player-item";

         let statusIcon = "";
         let statusClass = "";

         switch (player.status) {
            case PlayerStatus.READY: {
               statusIcon = "✓";
               statusClass = "status-ready";
               break;
            }
            case PlayerStatus.NOT_READY: {
               statusIcon = "";
               statusClass = "status-not-ready";
               break;
            }
            case PlayerStatus.DISCONNECTED: {
               statusIcon = "⚠";
               statusClass = "status-disconnected";
               break;
            }
         }

         const isCurrentPlayer = id === gs.player.id;
         const isLandlord = gs.room.game.landlord?.id === id;

         playerDiv.innerHTML = `
            <span class="status-checkbox ${statusClass}">${statusIcon}</span>
            <div class="player-name" style="${
               isCurrentPlayer ? "font-weight: bold;" : ""
            }">${player.name}${isLandlord ? " 👑" : ""}</div>
            <div class="card-count">${player.hand.cards.length || 0}</div>
         `;

         playerList.append(playerDiv);
      }
   }
}

// MARK: Game State UI

export function updateUIGame(): void {
   const game = gs.room.game;

   updateUIPlayerList();
   updateCardDisplay();

   // Show/hide UI elements based on game phase
   const readyButton = document.querySelector(
      "#ready-btn"
   ) as HTMLButtonElement;
   const playCardsButton = document.querySelector(
      "#play-cards-btn"
   ) as HTMLButtonElement;
   const passButton = document.querySelector("#pass-btn") as HTMLButtonElement;
   const biddingSection = document.querySelector(
      "#bidding-section"
   ) as HTMLDivElement;

   switch (game.phase) {
      case "bidding": {
         readyButton.style.display = "none";
         playCardsButton.style.display = "none";
         passButton.style.display = "none";

         biddingSection.style.display = "block";
         updateBiddingUI();

         break;
      }
      case "playing": {
         readyButton.style.display = "none";
         biddingSection.style.display = "none";

         const isMyTurn = isPlayersTurn();

         playCardsButton.style.display = isMyTurn ? "block" : "none";
         playCardsButton.disabled = !isMyTurn;

         passButton.style.display = isMyTurn ? "block" : "none";
         passButton.disabled = !isMyTurn;

         updateLastPlayUI();

         break;
      }
      case "finished": {
         readyButton.style.display = "block";
         playCardsButton.style.display = "none";
         passButton.style.display = "none";
         biddingSection.style.display = "none";

         break;
      }
   }

   updateGameInfoUI();
}

function updateBiddingUI(): void {
   const game = gs.room.game;

   const isMyTurn = isPlayersTurn();
   const currentBet = game.bet;

   const bid1Button = document.querySelector("#bid-1-btn") as HTMLButtonElement;
   const bid2Button = document.querySelector("#bid-2-btn") as HTMLButtonElement;
   const bid3Button = document.querySelector("#bid-3-btn") as HTMLButtonElement;
   const bidPassButton = document.querySelector(
      "#bid-pass-btn"
   ) as HTMLButtonElement;

   bid1Button.disabled = !isMyTurn || currentBet >= 1;
   bid2Button.disabled = !isMyTurn || currentBet >= 2;
   bid3Button.disabled = !isMyTurn || currentBet >= 3;
   bidPassButton.disabled = !isMyTurn;

   const biddingInfo = document.querySelector("#bidding-info");
   if (biddingInfo) biddingInfo.textContent = `Current bid: ${currentBet}`;
}

function updateLastPlayUI(): void {
   const game = gs.room.game;

   const lastPlaySection = document.querySelector(
      "#last-play"
   ) as HTMLDivElement;

   if (!game.lastPlay) {
      lastPlaySection.style.display = "none";
      return;
   }

   const playerName =
      gs.room.game.players[game.lastPlay.playerIndex].name || "Unknown";

   lastPlaySection.innerHTML = `
      <div class="last-play-header">Last Play by ${playerName}:</div>
      <div class="last-play-cards">${formatCards(game.lastPlay.cards)}</div>
      <div class="last-play-type">${formatPlayType(game.lastPlay.type)}</div>
   `;
   lastPlaySection.style.display = "block";
}

function updateGameInfoUI(): void {
   const game = gs.room.game;
   if (game.phase === "finished") return;

   const gameInfo = document.querySelector("#game-info") as HTMLDivElement;

   const currentPlayerName =
      gs.room.players.get(game.current.id)?.name || "Unknown";
   const landlordName = game.landlord?.id
      ? gs.room.players.get(game.landlord.id)?.name || "Unknown"
      : "None";

   gameInfo.innerHTML = `
      <div class="info-row">
         <span class="info-label">Phase:</span>
         <span class="info-value">${game.phase}</span>
      </div>
      <div class="info-row">
         <span class="info-label">Current Turn:</span>
         <span class="info-value">${currentPlayerName}</span>
      </div>
      <div class="info-row">
         <span class="info-label">Landlord:</span>
         <span class="info-value">${landlordName}</span>
      </div>
      <div class="info-row">
         <span class="info-label">Bet:</span>
         <span class="info-value">${game.bet}</span>
      </div>
   `;
}

// MARK: Chat UI

export function updateUIAllChat(): void {
   const chatMessagesDiv = document.querySelector("#chat-messages");
   if (!chatMessagesDiv) return;

   chatMessagesDiv.innerHTML = "";
   for (const message of gs.room.chat.messages) updateUIPushChat(message);
}

export function updateUIPushChat(message: ChatMessage): void {
   const chatMessagesDiv = document.querySelector("#chat-messages");
   if (!chatMessagesDiv) return;

   const getSenderName = () => {
      if (message.id === gs.player.id) return "You";
      if (message.id === "server") return "Server";
      return gs.room.players.get(message.id)?.name ?? "Unknown";
   };

   const messageDiv = document.createElement("div");
   messageDiv.className = `chat-message ${
      message.id === gs.player.id ? "own" : ""
   } ${message.id === "server" ? "server" : ""}`.trim();

   const senderName = getSenderName();

   messageDiv.innerHTML = `
      <div class="chat-sender">${senderName}</div>
      <div class="chat-text">${escapeHtml(message.message)}</div>
    `;
   chatMessagesDiv.append(messageDiv);
   chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}

export function sendChatMessage(): void {
   const chatInput = document.querySelector("#chat-input") as HTMLInputElement;

   const message = chatInput.value.trim();
   if (message.length > 0) {
      gs.socket.emit("send-chat", message);
      chatInput.value = "";
   }
}

// MARK: Notification System

function showNotification(message: string, duration: number = 3000): void {
   const notification = document.createElement("div");
   notification.className = "notification";
   notification.textContent = message;

   document.body.append(notification);

   setTimeout(() => {
      notification.classList.add("fade-out");
      setTimeout(() => {
         notification.remove();
      }, 300);
   }, duration);
}

// MARK: Start/End Game UI

export function startGameUI(): void {
   updateUIGame();
   showNotification("Game started!");
}

export function endGameUI(): void {
   const readyButton = document.querySelector(
      "#ready-btn"
   ) as HTMLButtonElement;
   const playCardsButton = document.querySelector(
      "#play-cards-btn"
   ) as HTMLButtonElement;
   const passButton = document.querySelector("#pass-btn") as HTMLButtonElement;
   const biddingSection = document.querySelector(
      "#bidding-section"
   ) as HTMLDivElement;

   readyButton.style.display = "block";
   playCardsButton.style.display = "none";
   passButton.style.display = "none";
   biddingSection.style.display = "none";

   updateUIPlayerList();
   clearCardSelection();
}

// MARK: Helper Functions

function formatCards(cards: Card[]): string {
   return cards
      .map((card) => {
         if (card.type === "Joker") return card.color === "BLACK" ? "🃏" : "🃟";

         if (card.type === "Playing") {
            const suitSymbols = { h: "♥", d: "♦", c: "♣", s: "♠" };
            const rankSymbols: Record<number, string> = {
               1: "A",
               11: "J",
               12: "Q",
               13: "K",
            };
            const rank = rankSymbols[card.rank] || card.rank.toString();
            return `${rank}${suitSymbols[card.suit]}`;
         }
         return "?";
      })
      .join(" ");
}

function formatPlayType(type: string): string {
   const typeNames: Record<string, string> = {
      solo: "Single",
      pair: "Pair",
      triple: "Triple",
      triple_with_single: "Triple + Single",
      triple_with_pair: "Triple + Pair",
      straight: "Straight",
      pair_straight: "Pair Straight",
      triple_straight: "Airplane",
      bomb: "Bomb 💣",
      rocket: "Rocket 🚀",
   };
   return typeNames[type] || type;
}

function escapeHtml(text: string): string {
   return text
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
}
