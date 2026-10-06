/** Synthesised countdown beeps and shutter click: no audio files, silent where Web Audio is unavailable. */
type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };
let context: AudioContext | undefined;

function audio(): AudioContext | undefined {
    const Context = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!Context) return undefined;
    try {
        context ??= new Context();
        if (context.state === 'suspended') void context.resume().catch(() => {});
        return context;
    } catch { return undefined; }
}

export function beep(frequency = 880, ms = 140) {
    const ctx = audio();
    if (!ctx) return;
    const osc = ctx.createOscillator(), gain = ctx.createGain(), start = ctx.currentTime;
    osc.type = 'sine'; osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + ms / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start); osc.stop(start + ms / 1000 + 0.02);
}

/** A short filtered noise burst reads as a camera shutter. */
export function shutter() {
    const ctx = audio();
    if (!ctx) return;
    const length = Math.floor(ctx.sampleRate * 0.12), buffer = ctx.createBuffer(1, length, ctx.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = buffer; filter.type = 'highpass'; filter.frequency.value = 1200; gain.gain.value = 0.6;
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
}
