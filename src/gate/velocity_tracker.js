/**
 * Velocity Tracker — Rate Limiter for AI Agent Purchases
 * 
 * Tracks purchase attempts per agent session across time windows.
 * Prevents:
 * - Retry loops creating mass orders (e.g. 10 attempts in 5 seconds)
 * - Runaway agents from exhausting session budget rapidly
 * - Denial-of-service on merchant checkout APIs
 * 
 * Stored in-memory per session. No persistence needed — resets on server restart.
 */

class VelocityTracker {
    constructor({
        maxAttemptsPerMinute = 5,
        maxAttemptsPerHour = 20,
        maxSuccessPerDay = 50
    } = {}) {
        this.limits = { maxAttemptsPerMinute, maxAttemptsPerHour, maxSuccessPerDay };
        // Events: [{ timestamp: Date, type: 'attempt'|'success', merchant, amount }]
        this.events = [];
    }

    /**
     * Records a new purchase attempt event
     */
    recordAttempt({ merchant, amount, type = 'attempt' } = {}) {
        this.events.push({
            timestamp: new Date(),
            type,
            merchant: merchant || 'UNKNOWN',
            amount: amount || 0
        });

        // Prune events older than 24 hours to prevent memory leak
        const cutoff = new Date(Date.now() - 24 * 3600 * 1000);
        this.events = this.events.filter(e => e.timestamp > cutoff);
    }

    /**
     * Returns events within the last N milliseconds
     */
    _eventsInWindow(ms) {
        const cutoff = new Date(Date.now() - ms);
        return this.events.filter(e => e.timestamp > cutoff);
    }

    /**
     * Checks if the current attempt would violate velocity limits
     * Returns { allowed: true } or { allowed: false, rule, reason }
     */
    check() {
        const lastMinute = this._eventsInWindow(60 * 1000);
        const lastHour = this._eventsInWindow(60 * 60 * 1000);
        const lastDay = this._eventsInWindow(24 * 60 * 60 * 1000);

        const successesToday = lastDay.filter(e => e.type === 'success').length;
        const attemptsLastMinute = lastMinute.length;
        const attemptsLastHour = lastHour.length;

        if (attemptsLastMinute >= this.limits.maxAttemptsPerMinute) {
            return {
                allowed: false,
                rule: 'VELOCITY_MINUTE_EXCEEDED',
                reason: `Purchase velocity too high: ${attemptsLastMinute} attempts in the last minute (limit: ${this.limits.maxAttemptsPerMinute}). Possible retry loop detected.`,
                stats: { attemptsLastMinute, attemptsLastHour, successesToday }
            };
        }

        if (attemptsLastHour >= this.limits.maxAttemptsPerHour) {
            return {
                allowed: false,
                rule: 'VELOCITY_HOUR_EXCEEDED',
                reason: `Purchase velocity too high: ${attemptsLastHour} attempts in the last hour (limit: ${this.limits.maxAttemptsPerHour}).`,
                stats: { attemptsLastMinute, attemptsLastHour, successesToday }
            };
        }

        if (successesToday >= this.limits.maxSuccessPerDay) {
            return {
                allowed: false,
                rule: 'DAILY_SUCCESS_CAP',
                reason: `Daily purchase success cap reached: ${successesToday} orders completed today (limit: ${this.limits.maxSuccessPerDay}).`,
                stats: { attemptsLastMinute, attemptsLastHour, successesToday }
            };
        }

        return {
            allowed: true,
            stats: { attemptsLastMinute, attemptsLastHour, successesToday }
        };
    }

    /**
     * Returns current velocity stats
     */
    getStats() {
        const lastMinute = this._eventsInWindow(60 * 1000);
        const lastHour = this._eventsInWindow(60 * 60 * 1000);
        const lastDay = this._eventsInWindow(24 * 60 * 60 * 1000);
        return {
            attemptsLastMinute: lastMinute.length,
            attemptsLastHour: lastHour.length,
            successesToday: lastDay.filter(e => e.type === 'success').length,
            totalEventsTracked: this.events.length
        };
    }
}

module.exports = { VelocityTracker };
