/** @type {import("tailwindcss").Config} */
const config = {
  darkMode: "media",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: withOpacity("--color-canvas"),
        surface: withOpacity("--color-surface"),
        "surface-elevated": withOpacity("--color-surface-elevated"),
        "surface-soft": withOpacity("--color-surface-soft"),
        "surface-tinted": withOpacity("--color-surface-tinted"),
        line: withOpacity("--color-line"),
        "line-strong": withOpacity("--color-line-strong"),
        ink: withOpacity("--color-ink"),
        "ink-soft": withOpacity("--color-ink-soft"),
        muted: withOpacity("--color-muted"),
        subtle: withOpacity("--color-subtle"),
        accent: withOpacity("--color-accent"),
        "accent-hover": withOpacity("--color-accent-hover"),
        "accent-soft": withOpacity("--color-accent-soft"),
        "accent-ink": withOpacity("--color-accent-ink"),
        danger: withOpacity("--color-danger"),
        "danger-hover": withOpacity("--color-danger-hover"),
        "danger-soft": withOpacity("--color-danger-soft"),
        success: withOpacity("--color-success"),
        "success-soft": withOpacity("--color-success-soft"),
        warning: withOpacity("--color-warning"),
        "warning-soft": withOpacity("--color-warning-soft")
      },
      fontFamily: {
        sans: ["Aptos", "Noto Sans TC", "Hiragino Sans", "Yu Gothic UI", "Segoe UI", "system-ui", "sans-serif"],
        reading: ["Yu Mincho", "Hiragino Mincho ProN", "Noto Serif CJK TC", "PMingLiU", "serif"]
      },
      borderRadius: {
        "ui-sm": "8px",
        "ui-md": "12px",
        "ui-lg": "18px"
      },
      boxShadow: {
        card: "var(--shadow-card)",
        float: "var(--shadow-float)"
      },
      ringWidth: {
        3: "3px"
      },
      opacity: {
        45: "0.45"
      },
      animation: {
        typing: "typing 1.1s ease-in-out infinite"
      },
      keyframes: {
        typing: {
          "0%, 60%, 100%": { opacity: "0.35", transform: "translateY(0)" },
          "30%": { opacity: "1", transform: "translateY(-2px)" }
        }
      }
    }
  },
  plugins: []
}

function withOpacity(variable) {
  return ({ opacityValue }) => {
    if (opacityValue === undefined) {
      return `rgb(var(${variable}))`
    }
    return `rgb(var(${variable}) / ${opacityValue})`
  }
}

module.exports = config
