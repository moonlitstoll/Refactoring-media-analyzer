/**
 * Robust Helper: Parse [HH:MM:SS.ms] or [MM:SS.ms] to Total Seconds (Float)
 * Formula: (H * 3600) + (M * 60) + S + (ms / 1000)
 */
export const parseTime = (timeStr) => {
    if (!timeStr) return 0;
    if (typeof timeStr === 'number') return Math.max(0, timeStr);

    // 1. Range Handling: Take the first part of "01:02 - 01:05" or similar
    let raw = timeStr.toString().split(/[-~]/)[0];

    // 2. Strict Cleaning: Keep ONLY digits, colons (:), and dots (.)
    const clean = raw.replace(/[^\d:.]/g, '');
    if (!clean) return 0;

    // 3. Mathematical Absolute Normalization
    const parts = clean.split(':');
    try {
        if (parts.length >= 2) {
            // Handle [SS.ms, MM, HH] in reverse to be agnostic to depth
            const rev = parts.reverse();
            const s = parseFloat(rev[0]) || 0;
            const m = parseFloat(rev[1]) || 0;
            const h = parseFloat(rev[2]) || 0;
            // Formula: H*3600 + M*60 + S (All as high-precision floats)
            return (h * 3600) + (m * 60) + s;
        } else {
            // Raw seconds (e.g., "79.5", "14")
            return parseFloat(clean) || 0;
        }
    } catch (e) {
        console.error("Critical: Universal Sync Engine Parse Error:", timeStr, e);
        return 0;
    }
};
