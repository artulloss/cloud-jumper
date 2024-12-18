import { EventBus } from "../EventBus";
import { Scene } from "phaser";
import { CollisionCategories } from "../../lib/CollisionCategories";
import { getScore, setScore } from "../PhaserGame.svelte";

export class Game extends Scene {
  camera: Phaser.Cameras.Scene2D.Camera;
  backgroundLayer1: Phaser.GameObjects.Image;
  character: Phaser.Physics.Arcade.Sprite;
  platforms: Phaser.Physics.Arcade.Group;
  enemies: Phaser.Physics.Arcade.Group;

  gameText: Phaser.GameObjects.Text;
  gameSpeedText: Phaser.GameObjects.Text; // Display for game speed multiplier

  totalJumps: number = 0;
  curJump: number = 0;
  maxJumps: number = 2;
  score: number = 0;

  lastPlatformY: number = 0;
  lastEnemyY: number = 0;
  scoreBonus: number = 0;

  currentGameSpeed: number = 1; // Base game speed multiplier

  constructor() {
    super("Game");
  }

  preload() {
    // Preload dust image and animation
    this.load.image('dust', 'assets/dust.png'); // Ensure the path is correct
    this.load.spritesheet('dust', 'assets/dust.png', { frameWidth: 32, frameHeight: 32 }); // Adjust frame width/height if needed
  }

  create() {
    this.camera = this.cameras.main;

    document
      .getElementById("playerName")
      ?.closest(".name-input")
      ?.classList.add("hidden");

    document.querySelector(".main-menu-buttons")?.classList.add("hidden");
    document.querySelector(".game-over-menu-buttons")?.classList.add("hidden");
    document
      .querySelector(".leaderboard-menu-buttons")
      ?.classList.add("hidden");
    document.getElementById("leaderboard")?.classList.add("hidden");
    document.querySelector(".hud")?.classList.remove("hidden");

    this.backgroundLayer1 = this.add.image(0, 0, "bg_layer1").setOrigin(0, 0);
    this.backgroundLayer1.setDisplaySize(this.camera.width, this.camera.height);
    this.backgroundLayer1.setScrollFactor(0);

    this.physics.world.setBounds(
      0,
      0,
      this.camera.width,
      this.camera.height,
      true,
      true,
      false,
      true
    );

    this.platforms = this.physics.add.group({
      allowGravity: false,
      immovable: true,
      collideWorldBounds: true,
    });

    this.enemies = this.physics.add.group({
      allowGravity: false,
      immovable: true,
    });

    // Spawn initial platforms
    for (let i = 0; i < 6; i++) {
      this.addPlatform(
        Phaser.Math.Between(150, this.camera.width - 150),
        this.camera.height - i * 150,
        this.getRandomPlatformMovement()
      );
    }

    this.addEnemies();
    this.addCharacter();
    this.addInputListeners();

    this.physics.add.collider(this.character, this.platforms);
    this.physics.add.collider(
      this.character,
      this.enemies,
      this.hitEnemy,
      undefined,
      this
    );

    this.lastPlatformY = 0;

    EventBus.emit("current-scene-ready", this);
  }

  addCharacter() {
    this.character = this.physics.add.sprite(0, 0, "sprites", "bunny1_stand");
    this.character.setOrigin(0.5, 1);

    const firstPlatform = this.platforms.getFirstAlive();
    this.character.setPosition(
      firstPlatform.x,
      firstPlatform.y - firstPlatform.height
    );

    this.character.setScale(0.66);
    this.character.setBounceX(1);
    this.character.setGravityY(500);
    this.character.setCollideWorldBounds(true);
  }

  addPlatform(x: number, y: number, movement: number = 0) {
    const platform = this.platforms.create(x, y, "sprites", "ground_grass");
    platform.setScale(0.33).refreshBody();
    platform.body.checkCollision.up = true;
    platform.body.checkCollision.down = false;
    platform.body.checkCollision.left = false;
    platform.body.checkCollision.right = false;

    platform.setVelocityX(movement * this.currentGameSpeed); // Apply game speed multiplier
    platform.setBounce(1);
    platform.setCollisionCategory(CollisionCategories.PLATFORM);
  }

  addEnemies() {
    const numEnemies = Phaser.Math.Between(1, 3);
    for (let i = 0; i < numEnemies; i++) {
      const x = Phaser.Math.Between(100, this.camera.width - 100);
      const y = Phaser.Math.Between(
        this.camera.scrollY - 200,
        this.camera.scrollY - 100
      );

      const enemy = this.enemies.create(x, y, "sprites", "flyMan_stand");
      enemy.setOrigin(0.5, 1);
      enemy.setScale(0.5);

      const movement = Phaser.Math.Between(-50, 50) * this.currentGameSpeed; // Apply game speed multiplier
      enemy.setVelocityX(movement);

      this.lastEnemyY = y;
    }
  }

  hitEnemy(
    character: Phaser.Types.Physics.Arcade.GameObjectWithBody,
    enemy: Phaser.Types.Physics.Arcade.GameObjectWithBody
  ) {
    if (
      character instanceof Phaser.Physics.Arcade.Sprite &&
      enemy instanceof Phaser.Physics.Arcade.Sprite
    ) {
      const isHorizontallyAligned =
        character.body.x + character.body.width > enemy.body.x &&
        character.body.x < enemy.body.x + enemy.body.width;

      if (character.y < enemy.y && isHorizontallyAligned) {
        // Player kills enemy by jumping on it
        this.scoreBonus += 100;
        enemy.setVelocityX(0);
        (enemy.body as Phaser.Physics.Arcade.Body).setAllowGravity(true);
        enemy.setGravityY(500);

        // Create dust effect when killing the enemy
        this.createExplosionEffect(enemy.x, enemy.y);

        // Destroy enemy after short delay
        setTimeout(() => {
          enemy.destroy();
        }, 300); // Short delay to prevent issues when destroying enemy

        // Stop further collision checks between character and this enemy
        this.physics.world.removeCollider(this.character, enemy);
        return;  // Early return to stop further processing in this function
      }
    }

    // If player touches enemy (without killing), create dust and trigger game over
    this.createExplosionEffect(character.x, character.y);
    this.gameOver();
  }

  createExplosionEffect(x: number, y: number) {
    const dust = this.add.sprite(x, y, "dust").setOrigin(0.5, 1);
    dust.setScale(0.05);
    dust.setAlpha(1);

    // Play dust animation if you have one
    dust.anims.play("dust", true);

    // Fade out the dust effect after 500 ms
    this.tweens.add({
      targets: dust,
      alpha: 0,
      ease: "Linear",
      duration: 500,
      onComplete: () => {
        dust.destroy();
      },
    });
  }

  addInputListeners() {
    this.input.keyboard!.on("keydown-SPACE", this.jump, this);
    this.input.keyboard!.on("keydown-LEFT", this.left, this);
    this.input.keyboard!.on("keyup-LEFT", this.stopX, this);
    this.input.keyboard!.on("keydown-RIGHT", this.right, this);
    this.input.keyboard!.on("keyup-RIGHT", this.stopX, this);

    this.input.on("pointerdown", this.jump, this);
  }

  jump() {
    this.curJump++;
    this.totalJumps++;
    this.character.setCollideWorldBounds(false);

    if (this.curJump <= this.maxJumps) {
      const gameSpeedFactor = (this.currentGameSpeed - 1) / 2 + 1;
      this.character.setVelocityY(-500 * gameSpeedFactor);
    }
  }

  left() {
    this.character.setVelocityX(-200);
    if (this.character.x < 0) {
      this.character.x = this.camera.width;
    }
  }

  right() {
    this.character.setVelocityX(200);
    if (this.character.x > this.camera.width) {
      this.character.x = 0;
    }
  }

  stopX() {
    this.character.setVelocityX(0);
  }

  gameOver() {
    this.scene.start("GameOver", this.input);
    this.currentGameSpeed = 1;
  }

  getRandomPlatformMovement() {
    const moves = Phaser.Math.Between(0, 100);
    if (moves < 20) {
      return Phaser.Math.Between(-100, 100);
    } else {
      return 0;
    }
  }

  update(time: number, delta: number): void {
    if (this.character.body && this.character.body.touching.down) {
      this.curJump = 0;
      this.jump();
    }

    const newScore = Math.max(
      Math.floor(((this.character.y - this.camera.height) / 3) * -1 - 32) +
        this.scoreBonus,
      getScore()
    );

    setScore(newScore);

    if (newScore > this.score) {
      this.score = newScore;

      // Increase game speed every 200 points, but with a more gradual curve
      const speedIncreaseThreshold = Math.floor(this.score / 200);
      if (Math.floor(this.score / 200) > Math.floor((this.score - 1) / 200)) {
        this.currentGameSpeed += 0.05 * Math.min(speedIncreaseThreshold, 5); // Limit the speed increase
        this.character.setGravityY(500 * this.currentGameSpeed);

        // Increase platform and enemy speeds dynamically
        this.platforms.children.iterate((platform) => {
          if (platform instanceof Phaser.Physics.Arcade.Sprite) {
            platform.setVelocityX(this.getRandomPlatformMovement() * this.currentGameSpeed);
          }
        });

        this.enemies.children.iterate((enemy) => {
          if (enemy instanceof Phaser.Physics.Arcade.Sprite) {
            const movement = Phaser.Math.Between(-50, 50) * this.currentGameSpeed;
            enemy.setVelocityX(movement); // Increase enemy movement
          }
        });
      }
    }

    if (this.character.y < this.camera.scrollY + this.camera.height / 2) {
      this.camera.scrollY = this.character.y - this.camera.height / 2;
    }

    // Add platforms as the player progresses upward
    if (this.character.y < this.lastPlatformY + 500 + this.camera.height) {
      const x = Phaser.Math.Between(50, this.camera.width - 50);
      const y = this.lastPlatformY - 150;

      this.addPlatform(x, y, this.getRandomPlatformMovement());
      this.lastPlatformY = y;
    }

    // Ensure enemies are added when the player is climbing up and near the top of the screen
    if (this.character.y < this.lastEnemyY - this.camera.height) {
      this.addEnemies();
    }

    // Destroy platforms that are off-screen
    this.platforms.children.iterate((platform) => {
      if (
        platform instanceof Phaser.Physics.Arcade.Sprite &&
        platform.y > this.camera.scrollY + this.camera.height
      ) {
        platform.destroy();
      }
      return null;
    });

    // Destroy enemies that are off-screen
    this.enemies.children.iterate((enemy) => {
      if (
        enemy instanceof Phaser.Physics.Arcade.Sprite &&
        enemy.y > this.camera.scrollY + this.camera.height
      ) {
        enemy.destroy();
      }
      return null;
    });

    if (this.character.y > this.camera.scrollY + this.camera.height) {
      this.gameOver();
    }
  }
}
