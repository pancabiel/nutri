const PATHS = {
  chat: <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8-1.05 0-2.06-.16-3-.46L4 21l.96-4.48A7.97 7.97 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>,
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
};

export default function Icon({ name, className = "w-5 h-5" }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={className}>
      {PATHS[name]}
    </svg>
  );
}
