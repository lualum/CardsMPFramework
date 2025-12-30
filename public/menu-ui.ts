import type { RoomListing } from "../shared/room";
import { stopPingUpdates } from "./game-ui";
import { sn } from "./session";

// Store the pending action
let pendingAction: (() => void) | undefined;

export function initMenuControls(): void {
   // Combined action button
   const actionButton = document.querySelector(
      "#action-btn"
   ) as HTMLButtonElement;
   const actionButtonText = actionButton.querySelector(
      "p"
   ) as HTMLParagraphElement;
   const roomCodeInput = document.querySelector(
      "#room-code-input"
   ) as HTMLInputElement;

   // Update button appearance based on input
   const updateActionButton = () => {
      const roomCode = roomCodeInput.value.trim() || "";

      if (roomCode.length === 0) {
         actionButtonText.textContent = "+";
         actionButton.style.background = "var(--green)";
         actionButtonText.style.transform = "translateY(0px)";
      } else {
         actionButtonText.textContent = "↪";
         actionButton.style.background = "var(--red)";
         actionButtonText.style.transform = "translateY(3px)";
      }
   };

   // Initial update
   updateActionButton();

   // Update on input
   roomCodeInput.addEventListener("input", updateActionButton);

   // Handle button click
   actionButton.addEventListener("click", () => {
      const roomCode = roomCodeInput.value.trim() || "";

      if (roomCode.length === 0) {
         // Create room
         if (
            checkAndPromptForName(() => {
               sn.socket.emit("create-room");
            })
         )
            sn.socket.emit("create-room");
      } else if (roomCode.length === 4) {
         // Join room
         if (
            checkAndPromptForName(() => {
               sn.socket.emit("join-room", roomCode);
            })
         )
            sn.socket.emit("join-room", roomCode);
      } else {
         showError("menu-error", "Room code must be 4 characters");
      }
   });

   roomCodeInput.addEventListener("keypress", (event: Event) => {
      const keyEvent = event as KeyboardEvent;
      if (keyEvent.key === "Enter") actionButton.click();
   });

   setupNameInput("player-name-input");

   const readyButton = document.querySelector("#ready-btn");
   readyButton?.addEventListener("click", () => {
      sn.socket.emit("toggle-ready");
   });

   const leaveRoomButton = document.querySelector("#leave-game-btn");
   leaveRoomButton?.addEventListener("click", () => {
      leaveRoom();
   });

   setupNameModal();
}

// Export this function so it can be used in other files
export function checkAndPromptForName(action: () => void): boolean {
   const nameInput = document.querySelector(
      "#player-name-input"
   ) as HTMLInputElement;
   const currentName = nameInput.value.trim() || "";

   if (!currentName) {
      pendingAction = action;
      showNameModal();
      return false;
   }

   return true;
}

function setupNameModal(): void {
   const modal = document.querySelector("#name-modal") as HTMLDivElement;
   const closeButton = document.querySelector(
      "#close-modal"
   ) as HTMLButtonElement;
   const submitButton = document.querySelector(
      "#submit-name-btn"
   ) as HTMLButtonElement;
   const modalInput = document.querySelector(
      "#modal-name-input"
   ) as HTMLInputElement;

   closeButton.addEventListener("click", () => {
      pendingAction = undefined;
      hideNameModal();
   });

   modal.addEventListener("click", (event) => {
      if (event.target === modal) {
         pendingAction = undefined;
         hideNameModal();
      }
   });

   submitButton.addEventListener("click", () => {
      const name = modalInput.value.trim();
      if (name) {
         const mainInput = document.querySelector(
            "#player-name-input"
         ) as HTMLInputElement;

         mainInput.value = name;

         sn.socket.emit("set-name", name);
         hideNameModal();

         // Execute the pending action
         if (pendingAction) {
            pendingAction();
            pendingAction = undefined;
         }
      }
   });

   modalInput.addEventListener("keypress", (event: Event) => {
      const keyEvent = event as KeyboardEvent;
      if (keyEvent.key === "Enter") submitButton.click();
   });
}

function showNameModal(): void {
   const modal = document.querySelector("#name-modal");
   const modalInput = document.querySelector(
      "#modal-name-input"
   ) as HTMLInputElement;
   if (modal) {
      modal.classList.remove("hidden");
      modalInput.focus();
   }
}

function hideNameModal(): void {
   const modal = document.querySelector("#name-modal");
   const modalInput = document.querySelector(
      "#modal-name-input"
   ) as HTMLInputElement;
   const errorElement = document.querySelector("#modal-error");
   if (modal) {
      modal.classList.add("hidden");
      modalInput.value = "";
      if (errorElement) errorElement.textContent = "";
   }
}

function handleNameSubmit(event: Event): void {
   const target = event.target as HTMLInputElement;
   const name = target.value.trim();
   if (name) sn.socket.emit("set-name", name);
}

function setupNameInput(elementId: string) {
   const input = document.querySelector(`#${elementId}`);

   input?.addEventListener("keypress", (event: Event) => {
      const keyEvent = event as KeyboardEvent;
      if (keyEvent.key === "Enter") handleNameSubmit(event);
   });

   input?.addEventListener("blur", handleNameSubmit);
}

export function leaveRoom(): void {
   globalThis.history.replaceState({}, "", globalThis.location.pathname);
   sn.socket.emit("leave-room");
   showMenuScreen();
}

export function showScreen(screenId: string): void {
   for (const screen of document.querySelectorAll(".screen"))
      screen.classList.add("hidden");

   const targetScreen = document.querySelector(`#${screenId}`);
   targetScreen?.classList.remove("hidden");
}

export function showMenuScreen(): void {
   showScreen("menu");
   clearErrors();
   const gameArea = document.querySelector("#game-area");
   if (gameArea) gameArea.innerHTML = "";
   sn.socket.emit("list-rooms");

   stopPingUpdates();
}

export function showError(elementId: string, message: string): void {
   const errorElement = document.querySelector(`#${elementId}`);
   if (errorElement) {
      errorElement.textContent = message;
      setTimeout(() => {
         errorElement.textContent = "";
      }, 5000);
   }
}

export function clearErrors(): void {
   for (const error of document.querySelectorAll(".error"))
      error.textContent = "";
}

export function updateLobbiesList(lobbies: RoomListing[]): void {
   const lobbiesContainer = document.querySelector("#lobbies-list");
   if (!lobbiesContainer) return;

   if (lobbies.length === 0) {
      lobbiesContainer.innerHTML = `
      <div class="no-lobbies">
        <p>No Lobbies Found!</p>
        <p style="font-size: 12px; margin-top: 5px">Create a new room or wait for others to host!</p>
      </div>`;
      return;
   }

   lobbiesContainer.innerHTML = "";

   for (const lobby of lobbies) {
      const lobbyDiv = document.createElement("div");
      lobbyDiv.className = "lobby-item";
      lobbyDiv.innerHTML = `
      <div class="lobby-info">
        <div class="lobby-code">${lobby.code}</div>
        <div class="lobby-players">
          <span style="color: var(--red); font-weight: 700;">${lobby.numPlayers}</span>
        </div>
      </div>
      <button class="lobby-join-btn">Join</button>
    `;

      lobbyDiv.addEventListener("click", () => {
         const roomCodeInput = document.querySelector(
            "#room-code-input"
         ) as HTMLInputElement;

         roomCodeInput.value = lobby.code;

         if (
            checkAndPromptForName(() => {
               sn.socket.emit("join-room", lobby.code);
            })
         )
            sn.socket.emit("join-room", lobby.code);
      });

      lobbiesContainer.append(lobbyDiv);
   }
}
