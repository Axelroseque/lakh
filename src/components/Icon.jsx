import {
  MdGridView, MdCalendarMonth, MdUploadFile, MdBugReport, MdSyncAlt, MdSmartToy, MdSettings,
  MdShield, MdLock, MdSearch, MdArrowForward, MdPerson, MdAutoFixHigh, MdBolt, MdCheckCircle,
  MdAttachFile, MdWarning, MdPhotoCamera, MdSchedule, MdEditNote, MdContentCopy, MdCloudSync,
  MdMenuBook, MdLink, MdVerified, MdAddCircle, MdSend, MdDns, MdFolder, MdAssignmentTurnedIn,
  MdMenu, MdClose, MdLogout, MdCloudUpload, MdAddAPhoto, MdTune, MdCompress, MdSpeed,
  MdInventory2, MdFolderSpecial, MdMemory, MdVerifiedUser, MdOpenInNew, MdDelete, MdClearAll,
  MdSync, MdHourglassTop, MdError, MdCloudDone, MdCheck, MdRefresh, MdSecurity, MdFilterVintage,
  MdDoneAll, MdConstruction, MdBlock, MdNetworkPing, MdTerminal, MdTableChart, MdUpdate, MdSaveAs,
  MdDeleteSweep, MdAlarmOn, MdCode, MdTimer, MdViewTimeline, MdRestartAlt, MdArticle, MdDataObject,
  MdTaskAlt, MdDataThresholding, MdHourglassEmpty, MdStorage, MdPause, MdPlayArrow, MdAddCircleOutline, MdInfo, MdCached
} from 'react-icons/md';

const ICONS = {
  grid: MdGridView, calendar: MdCalendarMonth, upload: MdUploadFile, bug: MdBugReport, sync_alt: MdSyncAlt,
  bot: MdSmartToy, settings: MdSettings, shield: MdShield, lock: MdLock, search: MdSearch, arrow: MdArrowForward,
  person: MdPerson, magic: MdAutoFixHigh, bolt: MdBolt, check_circle: MdCheckCircle, attach: MdAttachFile,
  warning: MdWarning, camera: MdPhotoCamera, schedule: MdSchedule, edit_note: MdEditNote, copy: MdContentCopy,
  cloud_sync: MdCloudSync, book: MdMenuBook, link: MdLink, verified: MdVerified, add: MdAddCircle, send: MdSend,
  dns: MdDns, folder: MdFolder, assignment: MdAssignmentTurnedIn, menu: MdMenu, close: MdClose, logout: MdLogout,
  cloud_upload: MdCloudUpload, add_photo: MdAddAPhoto, tune: MdTune, compress: MdCompress, speed: MdSpeed,
  inventory: MdInventory2, folder_special: MdFolderSpecial, memory: MdMemory, verified_user: MdVerifiedUser,
  open: MdOpenInNew, delete: MdDelete, clear_all: MdClearAll, sync: MdSync, hourglass: MdHourglassTop,
  error: MdError, cloud_done: MdCloudDone, check: MdCheck, refresh: MdRefresh, security: MdSecurity,
  filter: MdFilterVintage, done_all: MdDoneAll, construction: MdConstruction, block: MdBlock,
  ping: MdNetworkPing, terminal: MdTerminal, table: MdTableChart, update: MdUpdate, save_as: MdSaveAs,
  sweep: MdDeleteSweep, alarm: MdAlarmOn, code: MdCode, timer: MdTimer, timeline: MdViewTimeline,
  restart: MdRestartAlt, article: MdArticle, json: MdDataObject, task_alt: MdTaskAlt, quota: MdDataThresholding,
  hourglass_empty: MdHourglassEmpty, database: MdStorage, pause: MdPause, play: MdPlayArrow, add_outline: MdAddCircleOutline,
  info: MdInfo, cached: MdCached
};

export default function Icon({ name, size = 18, className = '', ...rest }) {
  const C = ICONS[name];
  if (!C) return null;
  return <C size={size} className={'shrink-0 ' + className} aria-hidden="true" {...rest} />;
}
