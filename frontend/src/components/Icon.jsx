const PATHS = {
  chat: <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8-1.05 0-2.06-.16-3-.46L4 21l.96-4.48A7.97 7.97 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>,
  layers: <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5"/>,
  calendar: <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>,
  box: <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>,
  plate: <path strokeLinecap="round" strokeLinejoin="round" d="M4 12a8 8 0 1116 0 8 8 0 01-16 0zm4 0a4 4 0 108 0 4 4 0 00-8 0z"/>,
  send: <path strokeLinecap="round" strokeLinejoin="round" d="M5 12l14-7-4 14-3-6-7-1z"/>,
  camera: <><path strokeLinecap="round" strokeLinejoin="round" d="M3 8a2 2 0 012-2h2l2-2h6l2 2h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 17a4 4 0 100-8 4 4 0 000 8z"/></>,
  plus: <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14"/>,
  trash: <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-1 12a2 2 0 01-2 2H8a2 2 0 01-2-2L5 7m5 0V4a1 1 0 011-1h2a1 1 0 011 1v3M3 7h18"/>,
  edit: <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.41-9.41a2 2 0 112.83 2.83L11.83 15H9v-2.83l8.59-8.58z"/>,
  close: <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18L18 6"/>,
  check: <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>,
  back: <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>,
  chevronR: <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>,
  chevronL: <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>,
  sparkles: <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.29 6.31L22 12l-6.71 2.29L13 21l-2.29-6.71L4 12l6.71-2.29L13 3z"/>,
  mic: <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v4m-4 0h8"/>,
  flame: <path strokeLinecap="round" strokeLinejoin="round" d="M12 2s4 4 4 8a4 4 0 11-8 0c0-2 1-3 1-5 0-1-1-2-1-2s4 1 4-1zM6 14a6 6 0 0012 0c0 4-3 8-6 8s-6-4-6-8z"/>,
  drumstick: <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 2a5.5 5.5 0 015.5 5.5c0 3.04-2.46 5.5-5.5 5.5-1 0-1.5.5-2 1l-5 5a2 2 0 11-3-3l5-5c.5-.5 1-1 1-2A5.5 5.5 0 0115.5 2z"/>,
  cog: <><path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09c0 .67.39 1.27 1 1.51a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.24.61.84 1 1.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/></>,
  lock: <><path strokeLinecap="round" strokeLinejoin="round" d="M5 11h14a1 1 0 011 1v8a1 1 0 01-1 1H5a1 1 0 01-1-1v-8a1 1 0 011-1z"/><path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0v4"/></>,
  crown: <path strokeLinecap="round" strokeLinejoin="round" d="M3 7l4 4 5-7 5 7 4-4-2 12H5L3 7z"/>,
  bell: <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>,
  spinner: <path strokeLinecap="round" d="M21 12a9 9 0 1 1-6.219-8.56"/>,
  users: <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a3 3 0 10-2-5.24"/>,
  heart: <path strokeLinecap="round" strokeLinejoin="round" d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 10-7.78 7.78L12 21l8.84-8.61a5.5 5.5 0 000-7.78z"/>,
  bookmark: <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z"/>,
  search: <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"/>,
  link: <path strokeLinecap="round" strokeLinejoin="round" d="M10 13a5 5 0 007.07 0l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.07 0l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>,
  userPlus: <path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM19 8v6M22 11h-6"/>,
};

export default function Icon({ name, className = "w-5 h-5" }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={className}>
      {PATHS[name]}
    </svg>
  );
}
