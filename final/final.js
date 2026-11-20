// Tune in your phone number.
// VOL changes the section TUNE points at; TUNE picks section 1, 2 or 3.
// SAVE latches until the number changes; RESET and RANDOM spring back.

const SECTIONS = [
  { digits: 3, max: 999 },
  { digits: 3, max: 999 },
  { digits: 4, max: 9999 },
];
const DEGREES_PER_STEP = 3;          // how far VOL turns for one step
const TUNE_ANGLES = [-45, 0, 45];    // knob angle pointing at stops 1, 2, 3
const STORAGE_KEY = 'tuned-phone-number';

const knob = document.getElementById('knob');
const tune = document.getElementById('tune');
const needle = document.getElementById('needle');
const groups = document.querySelectorAll('#readout .group');
const stops = document.querySelectorAll('.tune__stop');
const saveSwitch = document.getElementById('saveSwitch');
const saveLabel = document.getElementById('saveLabel');
const resetSwitch = document.getElementById('resetSwitch');
const randomSwitch = document.getElementById('randomSwitch');

let values = [0, 0, 0];
let active = 0;                      // index of the section being tuned

// ---------- drawing ----------

function render() {
  const section = SECTIONS[active];
  const value = values[active];

  groups.forEach((group, i) => {
    group.textContent = String(values[i]).padStart(SECTIONS[i].digits, '0');
    group.classList.toggle('is-active', i === active);
  });

  knob.style.setProperty('--angle', value * DEGREES_PER_STEP + 'deg');
  needle.style.setProperty('--pos', (value / section.max) * 100 + '%');

  knob.setAttribute('aria-valuemax', section.max);
  knob.setAttribute('aria-valuenow', value);
  knob.setAttribute('aria-valuetext', 'Section ' + (active + 1) + ': ' + groups[active].textContent);
  knob.setAttribute('aria-label',
    'Volume knob for section ' + (active + 1) + ': turn right to go up, left to go down');

  tune.style.setProperty('--tune-angle', TUNE_ANGLES[active] + 'deg');
  tune.setAttribute('aria-valuenow', active + 1);
  stops.forEach((stop, i) => stop.classList.toggle('is-active', i === active));
}

// Any change to the number un-latches SAVE
function setValue(index, value) {
  const clamped = Math.min(SECTIONS[index].max, Math.max(0, Math.round(value)));
  if (clamped === values[index]) return;
  values[index] = clamped;
  setSaved(false);
  render();
}

function setSection(index) {
  active = (index + SECTIONS.length) % SECTIONS.length;
  render();
}

// Angle of the pointer around an element's centre, in degrees (0 = straight up)
function pointerAngle(element, event) {
  const box = element.getBoundingClientRect();
  const dx = event.clientX - (box.left + box.width / 2);
  const dy = event.clientY - (box.top + box.height / 2);
  return Math.atan2(dx, -dy) * 180 / Math.PI;
}

// ---------- VOL knob ----------

let lastAngle = null;
let leftover = 0;                    // part of a step not yet applied

knob.addEventListener('pointerdown', (event) => {
  knob.setPointerCapture(event.pointerId);
  lastAngle = pointerAngle(knob, event);
  leftover = 0;
});

knob.addEventListener('pointermove', (event) => {
  if (lastAngle === null) return;
  const angle = pointerAngle(knob, event);
  let delta = angle - lastAngle;
  if (delta > 180) delta -= 360;     // crossing straight down jumps ±360
  if (delta < -180) delta += 360;
  lastAngle = angle;

  leftover += delta;
  const steps = Math.trunc(leftover / DEGREES_PER_STEP);
  if (steps !== 0) {
    leftover -= steps * DEGREES_PER_STEP;
    setValue(active, values[active] + steps);
  }
});

function endKnobDrag() { lastAngle = null; }
knob.addEventListener('pointerup', endKnobDrag);
knob.addEventListener('pointercancel', endKnobDrag);

knob.addEventListener('wheel', (event) => {
  event.preventDefault();
  setValue(active, values[active] + (event.deltaY < 0 ? 1 : -1));
}, { passive: false });

knob.addEventListener('keydown', (event) => {
  const max = SECTIONS[active].max;
  const changes = {
    ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1,
    PageUp: 10, PageDown: -10,
  };
  if (event.key in changes) {
    setValue(active, values[active] + changes[event.key]);
  } else if (event.key === 'Home') {
    setValue(active, 0);
  } else if (event.key === 'End') {
    setValue(active, max);
  } else {
    return;
  }
  event.preventDefault();
});

// ---------- TUNE knob ----------
// Drag to point it at a stop, or click to step to the next one.

let tuneDragging = false;
let tuneMoved = false;

tune.addEventListener('pointerdown', (event) => {
  tune.setPointerCapture(event.pointerId);
  tuneDragging = true;
  tuneMoved = false;
});

tune.addEventListener('pointermove', (event) => {
  if (!tuneDragging) return;
  const angle = pointerAngle(tune, event);
  const nearest = angle < -22.5 ? 0 : angle > 22.5 ? 2 : 1;
  if (nearest !== active) {
    tuneMoved = true;
    setSection(nearest);
  }
});

tune.addEventListener('pointerup', () => {
  if (tuneDragging && !tuneMoved) setSection(active + 1);
  tuneDragging = false;
});
tune.addEventListener('pointercancel', () => { tuneDragging = false; });

tune.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowRight' || event.key === 'ArrowUp') setSection(Math.min(active + 1, 2));
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') setSection(Math.max(active - 1, 0));
  else if (event.key === 'Enter' || event.key === ' ') setSection(active + 1);
  else return;
  event.preventDefault();
});

// ---------- dash switches ----------

function setSaved(saved) {
  saveSwitch.setAttribute('aria-pressed', saved);
  saveLabel.textContent = saved ? 'SAVED' : 'SAVE';
  saveLabel.classList.toggle('is-saved', saved);
}

saveSwitch.addEventListener('click', () => {
  const saved = saveSwitch.getAttribute('aria-pressed') !== 'true';
  try {
    if (saved) localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    else localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    // Storage can be blocked (private windows); the switch still works for this visit
  }
  setSaved(saved);
});

// Flick up, then spring back down
function springBack(toggle) {
  toggle.setAttribute('aria-pressed', 'true');
  setTimeout(() => toggle.setAttribute('aria-pressed', 'false'), 180);
}

resetSwitch.addEventListener('click', () => {
  springBack(resetSwitch);
  values.forEach((_, i) => setValue(i, 0));
  setSection(0);
});

randomSwitch.addEventListener('click', () => {
  springBack(randomSwitch);
  SECTIONS.forEach((section, i) => setValue(i, Math.random() * (section.max + 1) - 0.5));
});

// ---------- start ----------

// Bring back a saved number, with SAVE still latched
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  if (Array.isArray(saved) && saved.length === 3) {
    values = saved.map((v, i) => Math.min(SECTIONS[i].max, Math.max(0, Number(v) || 0)));
    setSaved(true);
  }
} catch (error) {
  // No saved number; start at zero
}

render();
