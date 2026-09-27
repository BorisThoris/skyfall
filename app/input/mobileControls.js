/**
 * Virtual key state for mobile overlay. Updated by joystick touch movement so
 * game code can read them like keyboard cursors.
 */
export const virtualKeys = {
  left: false,
  right: false,
  up: false,
  down: false
};

export function isMobile() {
  if (typeof navigator === "undefined") return false;
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints != null && navigator.maxTouchPoints > 0)
  );
}

const OVERLAY_ID = "mobile-controls-overlay";
const JOYSTICK_ID = "mobile-joystick";
const JOYSTICK_BASE_ID = "mobile-joystick-base";
const JOYSTICK_THUMB_ID = "mobile-joystick-thumb";
const JOYSTICK_DRAG_ID = "mobile-joystick-drag";
const DEAD_ZONE = 0.28;

function setKey(key, value) {
  if (virtualKeys[key] !== value) {
    virtualKeys[key] = value;
  }
}

function resetKeys() {
  setKey("left", false);
  setKey("right", false);
  setKey("up", false);
  setKey("down", false);
}

function updateDirectionalKeys(normX, normY) {
  setKey("left", normX < -DEAD_ZONE);
  setKey("right", normX > DEAD_ZONE);
  setKey("up", normY < -DEAD_ZONE);
  setKey("down", normY > DEAD_ZONE);
}

function initJoystickControl(base, thumb) {
  let activePointerId = null;

  const setThumbOffset = (offsetX, offsetY, maxRadius) => {
    thumb.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;
    updateDirectionalKeys(offsetX / maxRadius, offsetY / maxRadius);
  };

  const resetThumb = () => {
    thumb.style.transform = "translate(-50%, -50%)";
    resetKeys();
  };

  const moveThumb = (clientX, clientY) => {
    const rect = base.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const rawX = clientX - centerX;
    const rawY = clientY - centerY;
    const maxRadius = rect.width * 0.34;
    const magnitude = Math.hypot(rawX, rawY);

    const clampedX = magnitude > maxRadius ? (rawX / magnitude) * maxRadius : rawX;
    const clampedY = magnitude > maxRadius ? (rawY / magnitude) * maxRadius : rawY;

    setThumbOffset(clampedX, clampedY, maxRadius);
  };

  base.addEventListener("pointerdown", (event) => {
    activePointerId = event.pointerId;
    base.setPointerCapture?.(event.pointerId);
    moveThumb(event.clientX, event.clientY);
    event.preventDefault();
  });

  base.addEventListener("pointermove", (event) => {
    if (event.pointerId !== activePointerId) return;
    moveThumb(event.clientX, event.clientY);
    event.preventDefault();
  });

  const onPointerRelease = (event) => {
    if (event.pointerId !== activePointerId) return;
    activePointerId = null;
    resetThumb();
    event.preventDefault();
  };

  base.addEventListener("pointerup", onPointerRelease);
  base.addEventListener("pointercancel", onPointerRelease);
  base.addEventListener("lostpointercapture", () => { activePointerId = null; resetThumb(); });
  window.addEventListener("blur", () => { activePointerId = null; resetThumb(); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { activePointerId = null; resetThumb(); }
  });
}

function initJoystickDrag(container, joystick, dragHandle) {
  let dragPointerId = null;
  let offsetX = 0;
  let offsetY = 0;

  const clampPosition = (left, top) => {
    const containerRect = container.getBoundingClientRect();
    const joystickRect = joystick.getBoundingClientRect();
    const maxLeft = containerRect.width - joystickRect.width;
    const maxTop = containerRect.height - joystickRect.height;

    return {
      left: Math.max(0, Math.min(left, maxLeft)),
      top: Math.max(0, Math.min(top, maxTop))
    };
  };

  dragHandle.addEventListener("pointerdown", (event) => {
    dragPointerId = event.pointerId;
    dragHandle.setPointerCapture?.(event.pointerId);

    const joystickRect = joystick.getBoundingClientRect();
    offsetX = event.clientX - joystickRect.left;
    offsetY = event.clientY - joystickRect.top;
    event.preventDefault();
  });

  dragHandle.addEventListener("pointermove", (event) => {
    if (event.pointerId !== dragPointerId) return;

    const containerRect = container.getBoundingClientRect();
    const nextLeft = event.clientX - containerRect.left - offsetX;
    const nextTop = event.clientY - containerRect.top - offsetY;
    const clamped = clampPosition(nextLeft, nextTop);

    joystick.style.left = `${clamped.left}px`;
    joystick.style.top = `${clamped.top}px`;
    joystick.style.right = "auto";
    joystick.style.bottom = "auto";
    event.preventDefault();
  });

  const releaseDrag = (event) => {
    if (event.pointerId !== dragPointerId) return;
    dragPointerId = null;
    event.preventDefault();
  };

  dragHandle.addEventListener("pointerup", releaseDrag);
  dragHandle.addEventListener("pointercancel", releaseDrag);
}

export function initMobileControls() {
  if (!isMobile()) return;

  const container = document.getElementById(OVERLAY_ID);
  const joystick = document.getElementById(JOYSTICK_ID);
  const base = document.getElementById(JOYSTICK_BASE_ID);
  const thumb = document.getElementById(JOYSTICK_THUMB_ID);
  const dragHandle = document.getElementById(JOYSTICK_DRAG_ID);

  if (!container || !joystick || !base || !thumb || !dragHandle) return;

  initJoystickControl(base, thumb);
  initJoystickDrag(container, joystick, dragHandle);
  container.classList.add("mobile-controls-visible");
}
