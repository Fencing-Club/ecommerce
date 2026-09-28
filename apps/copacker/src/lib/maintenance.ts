// Added to a page request while Copacker is down for maintenance (src/server/maintenance.ts). next.config.ts then shows
// the maintenance page at the page's own address, and the page skips sign-in and the database, which may be down.
export const maintenanceHeader = "x-copacker-maintenance"
