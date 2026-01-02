import * as THREE from "three";
import type { Card } from "../shared/card";

type CardMesh = THREE.Mesh<
   THREE.PlaneGeometry,
   THREE.MeshStandardMaterial,
   THREE.Object3DEventMap
> & {
   userData: {
      card: Card;
      index: number;
      selected: boolean;
      originalY: number; // Store base Y to handle selection cleanly
   };
};

export interface CircularLayoutConfig {
   radius: number;
   arcAngle: number; // The total spread of the cards in degrees
   yOffset: number; // Height adjustment
   zOffset: number; // Depth adjustment (distance from camera)
   tiltX: number; // X-axis tilt (leaning back)
}

export class CardThreeUI {
   private scene: THREE.Scene;
   private camera: THREE.PerspectiveCamera;
   private renderer: THREE.WebGLRenderer;
   private cardMeshes: CardMesh[] = [];
   private raycaster: THREE.Raycaster;
   private mouse: THREE.Vector2;
   private container: HTMLElement;
   private textureLoader: THREE.TextureLoader;
   private selectedCards: Set<number> = new Set();

   private readonly CARD_WIDTH = 2;
   private readonly CARD_HEIGHT = 3;
   private readonly HOVER_SCALE = 1.1;
   private readonly SELECTED_LIFT = 0.5;

   // Default configuration
   private circularLayout: CircularLayoutConfig = {
      radius: 20, // Larger radius = flatter arc
      arcAngle: 60, // Tighter spread
      yOffset: -1,
      zOffset: 0,
      tiltX: 10, // Set to 0 for true top-down view
   };

   constructor(
      containerId: string,
      layoutConfig?: Partial<CircularLayoutConfig>
   ) {
      this.container = document.querySelector(containerId) as HTMLElement;

      if (layoutConfig)
         this.circularLayout = { ...this.circularLayout, ...layoutConfig };

      // 1. Scene Setup
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x1a_1a_1a);

      // 2. Camera Setup - Bird's eye view
      this.camera = new THREE.PerspectiveCamera(
         45,
         this.container.clientWidth / this.container.clientHeight,
         0.1,
         1000
      );
      // Position camera higher and angled down for a table-top view
      this.camera.position.set(0, 12, 15);
      this.camera.lookAt(0, 0, 0);

      // 3. Renderer Setup - Optimized for pixel art and transparency
      this.renderer = new THREE.WebGLRenderer({
         antialias: false, // Disabled for pixel art
         alpha: true,
         premultipliedAlpha: false, // Better transparency handling
      });
      this.renderer.setSize(
         this.container.clientWidth,
         this.container.clientHeight
      );
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.shadowMap.enabled = true;
      this.container.append(this.renderer.domElement);

      // 4. Interaction Tools
      this.raycaster = new THREE.Raycaster();
      this.mouse = new THREE.Vector2();
      this.textureLoader = new THREE.TextureLoader();

      // 5. Lighting
      this.setupLighting();

      // 6. Listeners & Loop
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
      this.renderer.domElement.addEventListener("click", (e) =>
         this.onCardClick(e)
      );
      this.renderer.domElement.addEventListener("mousemove", (e) =>
         this.onMouseMove(e)
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

   // --- Interaction Logic ---

   private updateMouseCoords(event: MouseEvent): void {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
   }

   private onMouseMove(event: MouseEvent): void {
      this.updateMouseCoords(event);
      this.raycaster.setFromCamera(this.mouse, this.camera);

      const intersects = this.raycaster.intersectObjects(this.cardMeshes);

      // Reset scales
      for (const mesh of this.cardMeshes) {
         if (!mesh.userData.selected) {
            mesh.scale.setScalar(1);
            // Optional: minimal Z-fighting prevention on hover reset
            mesh.position.z =
               mesh.userData.originalY + mesh.userData.index * 0.01;
         }
      }

      if (intersects.length > 0) {
         const hoveredCard = intersects[0].object as CardMesh;
         if (!hoveredCard.userData.selected)
            hoveredCard.scale.setScalar(this.HOVER_SCALE);
         // Pop slightly forward towards camera to avoid clipping neighbors
         // Note: In our setup, Camera Z is positive, so we increase Z slightly
         // But we need to account for rotation. Simpler to just scale for now.

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
         const index = clickedMesh.userData.index;

         if (this.selectedCards.has(index)) {
            this.selectedCards.delete(index);
            clickedMesh.userData.selected = false;
         } else {
            this.selectedCards.add(index);
            clickedMesh.userData.selected = true;
         }

         // Animate/Move to new position
         this.updateCardPosition(
            clickedMesh,
            index,
            this.cardMeshes.length,
            clickedMesh.userData.selected
         );
      }
   }

   // --- Core Layout Logic ---

   /**
    * Calculates the position on a circle arc.
    * * The logic defines a virtual "Pivot" point behind the cards.
    * angle = 0 is the center of the hand.
    */
   private updateCardPosition(
      mesh: CardMesh,
      index: number,
      totalCards: number,
      isSelected: boolean
   ): void {
      const { radius, arcAngle, yOffset, zOffset, tiltX } = this.circularLayout;

      // 1. Calculate Angle
      // Convert total arc to radians
      const totalArcRad = THREE.MathUtils.degToRad(arcAngle);
      // Calculate step between cards
      const step = totalCards > 1 ? totalArcRad / (totalCards - 1) : 0;
      // Start from the negative half to center the arc around 0
      const startAngle = -totalArcRad / 2;
      const angle = startAngle + index * step;

      // 2. Calculate Position (Polar coordinates)
      // We assume the pivot point is at (0, 0, radius + zOffset)
      // This ensures that the apex of the arc (angle 0) is at z = zOffset.

      const x = Math.sin(angle) * radius;

      // Z calculation:
      // At angle 0, cos(0)=1. We want z to be zOffset.
      // We want the arc to curve AWAY from the camera (concave for the viewer).
      // Standard Circle: z = cos(angle) * radius.
      // To anchor the center card at zOffset:
      // z = zOffset + radius * (1 - Math.cos(angle))  -> Curves towards camera
      // z = zOffset - radius * (1 - Math.cos(angle))  -> Curves away from camera

      // Let's use "Curved towards camera" (standard hand hold)
      // This means the center card is furthest back, sides come forward.
      // Or "Curved on table" (sides go back).

      // Implementation: Fixed Pivot point at (0, 0, zOffset - radius)
      // This makes the arc curve towards the camera (Concave).
      const z = zOffset - radius + Math.cos(angle) * radius;

      // Apply selection lift
      // If selected, we move it "up" (Y) and slightly "forward" (Z) relative to camera
      const lift = isSelected ? this.SELECTED_LIFT : 0;
      const y = yOffset + lift;

      mesh.position.set(x, y, z);

      // 3. Rotation
      // Rotate Y to face the pivot point (normal to the circle)
      // Rotate X for the "tilt" (looking down at cards)

      // Reset rotation
      mesh.rotation.set(0, 0, 0);

      // Apply Tilt (X)
      mesh.rotation.x = THREE.MathUtils.degToRad(-tiltX);

      // Apply Arc Rotation (Y)
      // If the card is on the left (negative angle), it should rotate right (negative Y rot)
      // to face the center/camera.
      mesh.rotation.y = -angle;

      // 4. Selection Scale
      const scale = isSelected ? 1.05 : 1;
      mesh.scale.set(scale, scale, scale);

      // Store Original Y for hover effects
      mesh.userData.originalY = y;
   }

   // --- Mesh Creation ---

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

      // PIXEL ART SETTINGS - Sharp, crisp rendering
      texture.minFilter = THREE.NearestFilter; // Sharp pixels, no blur
      texture.magFilter = THREE.NearestFilter; // Sharp pixels, no blur
      texture.generateMipmaps = false; // Disable mipmaps for pixel art
      texture.anisotropy = 1; // No anisotropic filtering

      return texture;
   }

   private createCardMesh(card: Card, index: number): CardMesh {
      const geometry = new THREE.PlaneGeometry(
         this.CARD_WIDTH,
         this.CARD_HEIGHT
      );

      const material = new THREE.MeshStandardMaterial({
         map: this.getCardTexture(card),
         side: THREE.DoubleSide,
         roughness: 0.5,
         metalness: 0.1,
         transparent: true, // Enable transparency
         alphaTest: 0.5, // Discard pixels below 50% opacity
         depthWrite: true, // Ensure proper depth sorting
      });

      const mesh = new THREE.Mesh(geometry, material) as CardMesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      mesh.userData = {
         card,
         index,
         selected: false,
         originalY: 0,
      };

      return mesh;
   }

   // --- Public API ---

   public renderHand(cards: Card[]): void {
      // Clean up old meshes
      for (const mesh of this.cardMeshes) {
         this.scene.remove(mesh);
         mesh.geometry.dispose();
         (mesh.material as THREE.Material).dispose();
      }
      this.cardMeshes = [];
      this.selectedCards.clear();

      // Create new meshes
      for (const [index, card] of cards.entries()) {
         const mesh = this.createCardMesh(card, index);
         this.scene.add(mesh);
         this.cardMeshes.push(mesh);
      }

      // Position them
      for (const [index, mesh] of this.cardMeshes.entries())
         this.updateCardPosition(mesh, index, cards.length, false);
   }

   public setCircularLayout(config: Partial<CircularLayoutConfig>): void {
      this.circularLayout = { ...this.circularLayout, ...config };

      // Update positions
      for (const [index, mesh] of this.cardMeshes.entries()) {
         this.updateCardPosition(
            mesh,
            index,
            this.cardMeshes.length,
            mesh.userData.selected
         );
      }
   }

   public getSelectedCards(): Card[] {
      return [...this.selectedCards]
         .sort((a, b) => a - b)
         .map((index) => this.cardMeshes[index].userData.card);
   }

   public clearSelection(): void {
      this.selectedCards.clear();
      for (const [index, mesh] of this.cardMeshes.entries()) {
         mesh.userData.selected = false;
         this.updateCardPosition(mesh, index, this.cardMeshes.length, false);
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

// --- Bridge Functions ---

let cardUI: CardThreeUI | undefined;

export function initCardUI(
   containerId: string = "#game-area",
   layoutConfig?: Partial<CircularLayoutConfig>
): void {
   if (!cardUI) cardUI = new CardThreeUI(containerId, layoutConfig);
}

export function updateCardDisplay(cards: Card[]): void {
   if (cardUI) cardUI.renderHand(cards);
}

export function getSelectedCardsFromUI(): Card[] {
   return cardUI ? cardUI.getSelectedCards() : [];
}

export function clearCardSelection(): void {
   if (cardUI) cardUI.clearSelection();
}

export function updateCircularLayout(
   config: Partial<CircularLayoutConfig>
): void {
   if (cardUI) cardUI.setCircularLayout(config);
}

export function disposeCardUI(): void {
   if (cardUI) {
      cardUI.dispose();
      cardUI = undefined;
   }
}
