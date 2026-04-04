/**
 * Notifications module
 * Handles user-facing notifications and error messages
 */

const DEFAULT_NOTIFICATION_DURATION_MS = 3000;
const NOTIFICATION_FADE_DURATION_MS = 300;

/**
 * Render transient notifications and persistent error overlays.
 */
export class NotificationManager {
    /**
     * Render a persistent error overlay.
     * @param {string} message - Error message
     */
    static error(message) {
        const errorOverlay = NotificationManager._createOverlay('error-overlay', message);
        document.body.appendChild(errorOverlay);
    }

    /**
     * Show a temporary notification.
     * Procedure:
     * 1) Remove any existing notification to keep a single active toast.
     * 2) Render the new notification.
     * 3) Fade it out after the requested duration and remove it from the DOM.
     * @param {string} message - Notification message
     * @param {number} duration - Duration in milliseconds
     */
    static show(message, duration = DEFAULT_NOTIFICATION_DURATION_MS) {
        NotificationManager._removeExistingNotification();

        const notificationOverlay = NotificationManager._createOverlay('notification-overlay', message);
        document.body.appendChild(notificationOverlay);

        NotificationManager._scheduleNotificationRemoval(notificationOverlay, duration);
    }

    static _createOverlay(className, message) {
        const overlay = document.createElement('div');
        overlay.className = className;
        overlay.textContent = message;
        return overlay;
    }

    static _removeExistingNotification() {
        const existingNotification = document.querySelector('.notification-overlay');
        if (!existingNotification) return;

        existingNotification.remove();
    }

    static _scheduleNotificationRemoval(notificationOverlay, duration) {
        setTimeout(() => {
            NotificationManager._fadeOutAndRemove(notificationOverlay);
        }, duration);
    }

    static _fadeOutAndRemove(notificationOverlay) {
        notificationOverlay.style.opacity = '0';
        setTimeout(() => {
            if (notificationOverlay.parentNode) {
                notificationOverlay.remove();
            }
        }, NOTIFICATION_FADE_DURATION_MS);
    }
}
