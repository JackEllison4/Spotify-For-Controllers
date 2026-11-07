/**
 * Xbox Gamepad Controller Manager
 * Uses HTML5 Gamepad API with 60fps polling, debouncing, analog trigger support,
 * and keyboard fallback.
 */
class ControllerManager {
  constructor() {
    this.gamepadIndex = null;
    this.connected = false;
    this.controllerName = 'No controller detected';

    // State tracking for debounce and repeat
    this.buttonStates = {};
    this.axisStates = { x: 0, y: 0, rx: 0, ry: 0 };
    this.lastNavTime = 0;
    this.navRepeatDelay = 240; // ms before hold-repeat begins
    this.navRepeatRate = 110;  // initial ms between hold-repeats
    this.activeNavDirection = null;
    this.navHoldStartTime = 0;

    // Analog triggers hold timer
    this.triggerIntervals = { lt: null, rt: null };

    // Event listeners
    this.listeners = new Map();

    this.deadzone = 0.35;
    this.debounceMs = 150;

    // Bind loop
    this.poll = this.poll.bind(this);
    this.init();
  }

  init() {
    window.addEventListener('gamepadconnected', (e) => {
      console.log('Gamepad connected at index %d: %s.', e.gamepad.index, e.gamepad.id);
      this.checkGamepads();
    });

    window.addEventListener('gamepaddisconnected', (e) => {
      console.log('Gamepad disconnected from index %d: %s', e.gamepad.index, e.gamepad.id);
      if (this.gamepadIndex === e.gamepad.index) {
        this.gamepadIndex = null;
        this.connected = false;
        this.controllerName = 'No controller detected';
        this.emit('controller:status', { connected: false, name: this.controllerName });
      }
      this.checkGamepads();
    });

    // Setup keyboard emulation for development and testing
    this.setupKeyboardFallback();

    // Start RAF polling loop
    requestAnimationFrame(this.poll);
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(handler);
  }

  off(event, handler) {
    if (this.listeners.has(event)) {
      const list = this.listeners.get(event).filter((h) => h !== handler);
      this.listeners.set(event, list);
    }
  }

  emit(event, detail = {}) {
    // 1. Dispatch custom DOM event on window
    const customEvent = new CustomEvent(event, { detail });
    window.dispatchEvent(customEvent);

    // 2. Call local subscribers
    if (this.listeners.has(event)) {
      for (const handler of this.listeners.get(event)) {
        try {
          handler(detail);
        } catch (err) {
          console.error(`Error in controller event handler for ${event}:`, err);
        }
      }
    }
  }

  checkGamepads() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    let found = null;

    // Prefer Xbox controller if available
    for (const gp of gamepads) {
      if (gp) {
        if (/xbox|xinput|microsoft/i.test(gp.id)) {
          found = gp;
          break;
        } else if (!found) {
          found = gp;
        }
      }
    }

    if (found) {
      const isNew = !this.connected || this.gamepadIndex !== found.index;
      this.gamepadIndex = found.index;
      this.connected = true;
      this.controllerName = found.id.includes('Xbox') ? 'Xbox Controller' : (found.id.split('(')[0].trim() || 'Game Controller');
      if (isNew) {
        this.emit('controller:status', { connected: true, name: this.controllerName, id: found.id });
      }
    } else {
      if (this.connected) {
        this.connected = false;
        this.gamepadIndex = null;
        this.controllerName = 'No controller detected';
        this.emit('controller:status', { connected: false, name: this.controllerName });
      }
    }
  }

  poll() {
    this.checkGamepads();

    if (this.connected && this.gamepadIndex !== null) {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = gamepads[this.gamepadIndex];
      if (gp && gp.connected) {
        this.processGamepadInputs(gp);
      }
    }

    requestAnimationFrame(this.poll);
  }

  processGamepadInputs(gp) {
    const now = performance.now();

    // Standard Gamepad Button Mapping:
    // 0: A
    // 1: B
    // 2: X
    // 3: Y
    // 4: LB
    // 5: RB
    // 6: LT (analog)
    // 7: RT (analog)
    // 8: Back / Select / View
    // 9: Start / Menu
    // 10: Left Stick Click
    // 11: Right Stick Click
    // 12: D-pad Up
    // 13: D-pad Down
    // 14: D-pad Left
    // 15: D-pad Right

    const buttons = gp.buttons;

    const checkButton = (index, eventName) => {
      const btn = buttons[index];
      const isPressed = typeof btn === 'object' ? btn.pressed : btn > 0.5;
      const prev = this.buttonStates[index] || { pressed: false, time: 0 };

      if (isPressed && !prev.pressed) {
        // Just pressed down
        if (now - prev.time > this.debounceMs) {
          this.emit(eventName, { index, button: btn });
          this.buttonStates[index] = { pressed: true, time: now };
        }
      } else if (!isPressed && prev.pressed) {
        // Released
        this.buttonStates[index] = { pressed: false, time: prev.time };
      }
    };

    // Digital action buttons
    checkButton(0, 'action:confirm');    // A
    checkButton(1, 'action:back');       // B
    checkButton(2, 'action:like');       // X
    checkButton(3, 'action:shuffle');    // Y
    checkButton(4, 'action:previous');   // LB
    checkButton(5, 'action:next');       // RB
    checkButton(8, 'action:queue');      // Select / View
    checkButton(9, 'action:search');     // Start / Menu

    // Process Analog Triggers (LT & RT) with continuous hold support
    this.processTrigger(6, buttons[6], 'action:volumeDown', 'lt', now);
    this.processTrigger(7, buttons[7], 'action:volumeUp', 'rt', now);

    // Process Directional Navigation (D-Pad and Left Analog Stick)
    this.processNavigation(gp, now);

    // Process Analog Sticks (Left Stick & Right Stick smooth scrolling)
    this.processSticks(gp, now);
  }

  processTrigger(btnIndex, btnObj, eventName, key, now) {
    const value = typeof btnObj === 'object' ? btnObj.value : (btnObj || 0);
    const isPressed = value > 0.15;
    const prev = this.buttonStates[btnIndex] || { pressed: false, time: 0, lastTick: 0 };

    if (isPressed) {
      if (!prev.pressed) {
        // Initial press
        this.emit(eventName, { value, initial: true });
        this.buttonStates[btnIndex] = { pressed: true, time: now, lastTick: now };
      } else {
        // Continuous hold rate: trigger deeper = faster repeat (between 90ms and 200ms)
        const repeatDelay = Math.max(90, Math.round(200 - value * 110));
        if (now - prev.lastTick > repeatDelay) {
          this.emit(eventName, { value, initial: false });
          this.buttonStates[btnIndex].lastTick = now;
        }
      }
    } else {
      if (prev.pressed) {
        this.buttonStates[btnIndex] = { pressed: false, time: now, lastTick: 0 };
      }
    }
  }

  processNavigation(gp, now) {
    const buttons = gp.buttons;
    const axes = gp.axes;

    let dirX = 0;
    let dirY = 0;

    // 1. D-Pad handles crisp digital directional navigation across all screens
    if (buttons[12] && buttons[12].pressed) dirY = -1; // Up
    if (buttons[13] && buttons[13].pressed) dirY = 1;  // Down
    if (buttons[14] && buttons[14].pressed) dirX = -1; // Left
    if (buttons[15] && buttons[15].pressed) dirX = 1;  // Right

    // 2. Left Analog Stick (Axes 0 = X, Axes 1 = Y)
    const currentScreen = window.uiManager?.currentScreen;
    const isVerticalList = currentScreen === 'liked' ||
                           currentScreen === 'playlists' ||
                           currentScreen === 'playlistDetail' ||
                           currentScreen === 'queue';

    if (axes && axes.length >= 1) {
      const stickX = axes[0];
      const stickY = axes.length >= 2 ? axes[1] : 0;

      if (isVerticalList) {
        // In vertical list screens (Liked Songs, Playlists, etc.):
        // - Horizontal stick movement triggers fast 6-track page skips
        if (dirX === 0 && Math.abs(stickX) > this.deadzone) {
          dirX = stickX > 0 ? 1 : -1;
        }
        // - Vertical stick movement is handled by processSticks for buttery smooth 60fps analog scrolling!
      } else {
        // In grid/menu screens (Home 3x3 menu, Albums, Artists, Search):
        // - Left Stick provides crisp 4-way navigation with dominant axis selection!
        if (dirX === 0 && dirY === 0) {
          const absX = Math.abs(stickX);
          const absY = Math.abs(stickY);

          if (absX > this.deadzone || absY > this.deadzone) {
            if (absX >= absY) {
              dirX = stickX > 0 ? 1 : -1;
            } else {
              dirY = stickY > 0 ? 1 : -1;
            }
          }
        }
      }
    }

    let currentDirection = null;
    if (dirY === -1) currentDirection = 'nav:up';
    else if (dirY === 1) currentDirection = 'nav:down';
    else if (dirX === -1) currentDirection = 'nav:left';
    else if (dirX === 1) currentDirection = 'nav:right';

    if (currentDirection) {
      if (this.activeNavDirection !== currentDirection) {
        // New direction pressed: fire immediately
        this.activeNavDirection = currentDirection;
        this.navHoldStartTime = now;
        this.lastNavTime = now;
        this.emit(currentDirection);
      } else {
        // Direction is being held: accelerate repeat rate dynamically
        const timeHeld = now - this.navHoldStartTime;
        const speedBoost = Math.min(70, Math.floor(timeHeld / 350) * 22);
        const dynamicRate = Math.max(38, this.navRepeatRate - speedBoost);

        if (timeHeld > this.navRepeatDelay && now - this.lastNavTime > dynamicRate) {
          this.lastNavTime = now;
          this.emit(currentDirection);
        }
      }
    } else {
      // Released
      this.activeNavDirection = null;
    }
  }

  processSticks(gp, now) {
    const axes = gp.axes;
    if (!axes || axes.length === 0) return;

    const currentScreen = window.uiManager?.currentScreen;
    const isVerticalList = currentScreen === 'liked' ||
                           currentScreen === 'playlists' ||
                           currentScreen === 'playlistDetail' ||
                           currentScreen === 'queue';

    // 1. Left Analog Stick Vertical (Axes 1 = Y)
    // In vertical list views (Liked Songs, Playlists, etc.), Left Stick provides buttery smooth scrolling!
    if (isVerticalList && axes.length >= 2) {
      const lY = axes[1];
      if (Math.abs(lY) > 0.15) {
        const delta = Math.sign(lY) * Math.pow(Math.abs(lY), 1.5) * 36;
        this.emit('scroll:page', { deltaY: delta, source: 'leftStick', axisY: lY });
      }
    }

    // 2. Right Analog Stick Vertical (Axes 3 = Y)
    // Dedicated smooth page scrolling on all scrollable screens
    if (axes.length >= 4) {
      const rY = axes[3];
      if (Math.abs(rY) > 0.15) {
        const delta = Math.sign(rY) * Math.pow(Math.abs(rY), 1.5) * 36;
        this.emit('scroll:page', { deltaY: delta, source: 'rightStick', axisY: rY });
      }
    }
  }

  /**
   * Keyboard fallback for testing when no Xbox controller is connected
   */
  setupKeyboardFallback() {
    window.addEventListener('keydown', (e) => {
      // If user is actively typing in an input element, do not hijack typing keys except Escape and Enter
      const isInputActive = document.activeElement && document.activeElement.tagName === 'INPUT';

      if (isInputActive) {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.emit('action:back');
        } else if (e.key === 'Enter') {
          this.emit('action:confirm');
        }
        return;
      }

      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          this.emit('nav:up');
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          this.emit('nav:down');
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
        case 'PageUp':
          e.preventDefault();
          this.emit('nav:left');
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
        case 'PageDown':
          e.preventDefault();
          this.emit('nav:right');
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          this.emit('action:confirm'); // A
          break;
        case 'Escape':
        case 'Backspace':
          e.preventDefault();
          this.emit('action:back'); // B
          break;
        case 'x':
        case 'X':
          e.preventDefault();
          this.emit('action:like'); // X
          break;
        case 'y':
        case 'Y':
          e.preventDefault();
          this.emit('action:shuffle'); // Y
          break;
        case '[':
        case 'PageUp':
          e.preventDefault();
          this.emit('action:previous'); // LB
          break;
        case ']':
        case 'PageDown':
          e.preventDefault();
          this.emit('action:next'); // RB
          break;
        case '-':
        case '_':
          e.preventDefault();
          this.emit('action:volumeDown'); // LT
          break;
        case '=':
        case '+':
          e.preventDefault();
          this.emit('action:volumeUp'); // RT
          break;
        case 'Tab':
        case 'q':
        case 'Q':
          e.preventDefault();
          this.emit('action:queue'); // Select
          break;
        case '/':
        case 'f':
        case 'F':
          e.preventDefault();
          this.emit('action:search'); // Start
          break;
      }
    });
  }
}

// Global instance in renderer
window.controllerManager = new ControllerManager();

