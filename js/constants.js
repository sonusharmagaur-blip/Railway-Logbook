export const Constants = {
  backupFolderName: "RailwayLogbook Backups",
  backupFilenamePrefix: "RailwayLogbook-Backup-",
  backupFilenameExtension: ".json",
  driveScope: "https://www.googleapis.com/auth/drive.file",
  sheetsScope: "https://www.googleapis.com/auth/spreadsheets",
  get googleScopes() {
    return `${this.driveScope} ${this.sheetsScope}`;
  },
  minimumMsBetweenOpportunisticBackups: 20 * 3600 * 1000,
};
