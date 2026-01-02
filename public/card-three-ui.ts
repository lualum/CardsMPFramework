import * as THREE from "three";
import type { Card } from "../shared/card";
import type { Game } from "../shared/game";
import { gs } from "./session";

type CardMesh = THREE.Mesh<
   THREE.PlaneGeometry,
   THREE.MeshStandardMaterial,
   THREE.Object3DEventMap
> & {
   userData: {
      card: Card;
      index: number;
      seat: number;
      selected: boolean;
      originalY: number;
   };
};

export class CardThreeUI {
   private scene: THREE.Scene;
   private camera: THREE.PerspectiveCamera;
   private renderer: THREE.WebGLRenderer;
   private cardMeshes: CardMesh[] = [];
   private raycaster: THREE.Raycaster;
   private mouse: THREE.Vector2;
   private container: HTMLElement;
   private textureLoader: THREE.TextureLoader;
   private selectedCards: Set<string> = new Set();

   private readonly TABLE_RADIUS = 8;
   private readonly CARD_WIDTH = 2;
   private readonly CARD_HEIGHT = 3;
   private readonly HOVER_SCALE = 1.1;
   private readonly SELECTED_LIFT = 0.5;
   private readonly CARD_SPACING = 0.5;

   private readonly CAMERA_FOV = 45;
   private readonly CAMERA_NEAR = 0.1;
   private readonly CAMERA_FAR = 1000;
   private readonly CAMERA_POS_X = 0;
   private readonly CAMERA_POS_Y = 5;
   private readonly CAMERA_POS_Z = 15;

   constructor(containerId: string) {
      this.container = document.querySelector(containerId) as HTMLElement;

      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x1a_1a_1a);

      this.camera = new THREE.PerspectiveCamera(
         this.CAMERA_FOV,
         this.container.clientWidth / this.container.clientHeight,
         this.CAMERA_NEAR,
         this.CAMERA_FAR
      );
      // Repositioned camera to view seat 0's hand from behind
      this.camera.position.set(
         this.CAMERA_POS_X,
         this.CAMERA_POS_Y,
         this.CAMERA_POS_Z
      );
      this.camera.lookAt(0, 0, 0);

      this.renderer = new THREE.WebGLRenderer({
         antialias: false,
         alpha: true,
         premultipliedAlpha: false,
      });

      this.renderer.setSize(
         this.container.clientWidth,
         this.container.clientHeight
      );
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.shadowMap.enabled = true;
      this.container.append(this.renderer.domElement);

      this.raycaster = new THREE.Raycaster();
      this.mouse = new THREE.Vector2();
      this.textureLoader = new THREE.TextureLoader();

      this.setupLighting();
      this.setupEventListeners();
      this.animate();
   }

   private setupLighting(): void {
      const ambientLight = new THREE.AmbientLight(0xff_ff_ff, 0.7);
      this.scene.add(ambientLight);

      const mainLight = new THREE.DirectionalLight(0xff_ff_ff, 0.8);
      mainLight.position.set(5, 15, 10);
      mainLight.castShadow = true;
      mainLight.shadow.mapSize.width = 1024;
      mainLight.shadow.mapSize.height = 1024;
      this.scene.add(mainLight);
   }

   private setupEventListeners(): void {
      window.addEventListener("resize", () => this.onWindowResize());
      this.renderer.domElement.addEventListener("click", (event) =>
         this.onCardClick(event)
      );
      this.renderer.domElement.addEventListener("mousemove", (event) =>
         this.onMouseMove(event)
      );
   }

   private onWindowResize(): void {
      this.camera.aspect =
         this.container.clientWidth / this.container.clientHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(
         this.container.clientWidth,
         this.container.clientHeight
      );
   }

   private updateMouseCoords(event: MouseEvent): void {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
   }

   private onMouseMove(event: MouseEvent): void {
      this.updateMouseCoords(event);
      this.raycaster.setFromCamera(this.mouse, this.camera);

      const intersects = this.raycaster.intersectObjects(this.cardMeshes);

      for (const mesh of this.cardMeshes) {
         if (!mesh.userData.selected) {
            mesh.scale.setScalar(1);
            mesh.position.y = mesh.userData.originalY;
         }
      }

      if (intersects.length > 0) {
         const hoveredCard = intersects[0].object as CardMesh;
         if (!hoveredCard.userData.selected)
            hoveredCard.scale.setScalar(this.HOVER_SCALE);

         this.renderer.domElement.style.cursor = "pointer";
      } else {
         this.renderer.domElement.style.cursor = "default";
      }
   }

   private onCardClick(event: MouseEvent): void {
      this.updateMouseCoords(event);
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(this.cardMeshes);

      if (intersects.length > 0) {
         const clickedMesh = intersects[0].object as CardMesh;
         const cardKey = `${clickedMesh.userData.seat}-${clickedMesh.userData.index}`;

         if (this.selectedCards.has(cardKey)) {
            this.selectedCards.delete(cardKey);
            clickedMesh.userData.selected = false;
         } else {
            this.selectedCards.add(cardKey);
            clickedMesh.userData.selected = true;
         }

         this.updateCardPosition(clickedMesh);
      }
   }

   private updateCardPosition(mesh: CardMesh): void {
      const seat = mesh.userData.seat;
      const index = mesh.userData.index;
      const isSelected = mesh.userData.selected;

      // Get hand size for this seat - use actual game data
      const handSize = this.cardMeshes.filter(
         (m) => m.userData.seat === seat
      ).length;

      // Calculate angle for this seat around the table
      const totalPlayers =
         Math.max(...this.cardMeshes.map((m) => m.userData.seat)) + 1;
      const seatAngle = (seat / totalPlayers) * Math.PI * 2;

      // Calculate position of hand center
      const centerX = Math.sin(seatAngle) * this.TABLE_RADIUS;
      const centerZ = Math.cos(seatAngle) * this.TABLE_RADIUS;

      // Calculate offset for this card within the hand
      const cardOffset = (index - (handSize - 1) / 2) * this.CARD_SPACING;

      // Calculate perpendicular direction for spreading cards
      const perpAngle = seatAngle + Math.PI / 2;
      const offsetX = Math.sin(perpAngle) * cardOffset;
      const offsetZ = Math.cos(perpAngle) * cardOffset;

      const x = centerX + offsetX;
      const z = centerZ + offsetZ;
      const y = isSelected ? this.SELECTED_LIFT : 0;

      mesh.position.set(x, y, z);
      mesh.rotation.set(0, 0, 0);
      // Rotate card to face center of table
      mesh.rotation.y = -seatAngle + Math.PI;

      const scale = isSelected ? this.HOVER_SCALE : 1;
      mesh.scale.set(scale, scale, scale);

      mesh.userData.originalY = y;
   }

   private getCardTexture(card: Card): THREE.Texture {
      let path = "/cards/card_back.png";

      if (card.type === "Joker") {
         path = `/cards/card_joker_${card.color.toLowerCase()}.png`;
      } else if (card.type === "Playing") {
         const suitMap: Record<string, string> = {
            h: "hearts",
            d: "diamonds",
            c: "clubs",
            s: "spades",
         };
         const rankMap: Record<number, string> = {
            1: "A",
            11: "J",
            12: "Q",
            13: "K",
         };
         const rankString =
            rankMap[card.rank] || String(card.rank).padStart(2, "0");
         path = `/cards/card_${suitMap[card.suit]}_${rankString}.png`;
      }

      const texture = this.textureLoader.load(path);

      texture.minFilter = THREE.NearestFilter;
      texture.magFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.anisotropy = 1;

      return texture;
   }

   private createCardMesh(card: Card, index: number, seat: number): CardMesh {
      const geometry = new THREE.PlaneGeometry(
         this.CARD_WIDTH,
         this.CARD_HEIGHT
      );

      const material = new THREE.MeshStandardMaterial({
         map: this.getCardTexture(card),
         side: THREE.DoubleSide,
         roughness: 0.5,
         metalness: 0.1,
         transparent: true,
         alphaTest: 0.5,
         depthWrite: true,
      });

      const mesh = new THREE.Mesh(geometry, material) as CardMesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      mesh.userData = {
         card,
         index,
         seat,
         selected: false,
         originalY: 0,
      };

      return mesh;
   }

   public renderHand(game: Game): void {
      for (const mesh of this.cardMeshes) {
         this.scene.remove(mesh);
         mesh.geometry.dispose();
         (mesh.material as THREE.Material).dispose();
      }
      this.cardMeshes = [];
      this.selectedCards.clear();

      // Create new meshes for each player's hand
      for (const [seat, player] of game.players.entries()) {
         for (const [index, card] of player.hand.cards.entries()) {
            const mesh = this.createCardMesh(card, index, seat);
            this.scene.add(mesh);
            this.cardMeshes.push(mesh);
         }
      }

      // Update all positions AFTER all meshes are created
      // This ensures handSize is calculated correctly for all cards
      for (const mesh of this.cardMeshes) this.updateCardPosition(mesh);
   }

   public getSelectedCards(): Card[] {
      return [...this.selectedCards]
         .toSorted((a, b) => {
            const [seatA, indexA] = a.split("-").map(Number);
            const [seatB, indexB] = b.split("-").map(Number);
            return seatA === seatB ? indexA - indexB : seatA - seatB;
         })
         .map((key) => {
            const [seat, index] = key.split("-").map(Number);
            return this.cardMeshes.find(
               (m) => m.userData.seat === seat && m.userData.index === index
            )!.userData.card;
         });
   }

   public clearSelection(): void {
      this.selectedCards.clear();
      for (const mesh of this.cardMeshes) {
         mesh.userData.selected = false;
         this.updateCardPosition(mesh);
      }
   }

   private animate = (): void => {
      requestAnimationFrame(this.animate);
      this.renderer.render(this.scene, this.camera);
   };

   public dispose(): void {
      window.removeEventListener("resize", this.onWindowResize);
      for (const mesh of this.cardMeshes) {
         mesh.geometry.dispose();
         (mesh.material as THREE.Material).dispose();
      }
      this.renderer.dispose();
      this.renderer.domElement.remove();
   }
}

let cardUI: CardThreeUI | undefined;

export function initCardUI(containerId: string = "#game-area"): void {
   if (!cardUI) cardUI = new CardThreeUI(containerId);
}

export function updateCardDisplay(): void {
   if (cardUI) cardUI.renderHand(gs.room.game);
}

export function getSelectedCardsFromUI(): Card[] {
   return cardUI ? cardUI.getSelectedCards() : [];
}

export function clearCardSelection(): void {
   if (cardUI) cardUI.clearSelection();
}

export function disposeCardUI(): void {
   if (cardUI) {
      cardUI.dispose();
      cardUI = undefined;
   }
}
