// toast.ts
import { Notyf } from "npm:notyf";

export const notyf = new Notyf({
  duration: 2000,
  dismissible: true,
  position: { x: "right", y: "top" },
  types: [
    {
      type: 'warning',
      background: 'orange',
      icon: {
        className: 'toast-icon-warning',
        tagName: 'i',
        text: 'warn'
      }
    },
    {
      type: 'error',
      background: 'indianred',
      duration: 5000,
      dismissible: true,
      icon: {
        className: 'material-icons',
        tagName: 'i',
        text: 'Refresh'
      }
    }
  ]
});

export const toast = {
  notify(message: string) {
    notyf.open({ type: "info", message });
  },
  debug(message: string) {
    notyf.open({ type: "info", message, background: "#64748b" });
  },
  warn(message: string) {
    notyf.open({ type: "warning", message, background: "#facc15" });
  },
  error(message: string) {
    notyf.error(message);
  },
  success(message: string) {
    notyf.success(message);
  },
};
