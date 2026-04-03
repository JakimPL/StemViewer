/**
 * Notifications module
 * Handles user-facing notifications and error messages
 */

/**
 * Notification manager with static methods for showing errors and temporary messages
 */
export class NotificationManager {
    /**
     * Show error message to user
     * @param {string} message - Error message
     */
    static error(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-overlay';
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
    }

    /**
     * Show temporary notification message to user
     * @param {string} message - Notification message
     * @param {number} duration - Duration in milliseconds (default 3000)
     */
    static show(message, duration = 3000) {
        // Remove any existing notification first
        const existingNotification = document.querySelector('.notification-overlay');
        if (existingNotification) {
            document.body.removeChild(existingNotification);
        }

        const notificationDiv = document.createElement('div');
        notificationDiv.className = 'notification-overlay';
        notificationDiv.textContent = message;
        document.body.appendChild(notificationDiv);

        // Fade out and remove after duration
        setTimeout(() => {
            notificationDiv.style.opacity = '0';
            setTimeout(() => {
                if (notificationDiv.parentNode) {
                    document.body.removeChild(notificationDiv);
                }
            }, 300); // Wait for fade transition to complete
        }, duration);
    }
}
