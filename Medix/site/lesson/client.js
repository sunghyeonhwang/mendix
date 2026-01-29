// ============================================================
// Dark Mode / Light Mode Theme Manager
// - Syncs Tailwind CSS 'dark' class AND [data-theme] attribute
// - Detects system color-scheme preference (prefers-color-scheme)
// - Persists user choice in localStorage (key: 'theme')
// - Listens for real-time OS-level theme changes
// - Exposes window._themeManager API for external access
// ============================================================
(function () {
  var STORAGE_KEY = 'theme';
  var root = document.documentElement;
  var toggle = document.getElementById('themeToggle');
  var mediaQuery = window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

  // ----------------------------------------------------------
  // Core: Apply dark or light theme to the document
  // Sets both Tailwind 'dark' class and data-theme attribute
  // ----------------------------------------------------------
  function applyTheme(isDark) {
    if (isDark) {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
    }

    // Update toggle button ARIA state for accessibility
    if (toggle) {
      toggle.setAttribute(
        'aria-label',
        isDark ? '라이트모드로 전환' : '다크모드로 전환'
      );
      toggle.setAttribute('aria-pressed', String(isDark));
    }

    // Dispatch custom event so other modules can react to theme changes
    try {
      root.dispatchEvent(
        new CustomEvent('themechange', {
          detail: { theme: isDark ? 'dark' : 'light' },
        })
      );
    } catch (_) {
      // CustomEvent not supported in older browsers — safe to ignore
    }
  }

  // ----------------------------------------------------------
  // Resolve the effective theme (dark or light)
  // Priority: localStorage manual choice > system preference
  // ----------------------------------------------------------
  function resolveTheme() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
    } catch (_) {
      // localStorage may be unavailable (private browsing, disabled)
    }
    // No manual preference — follow system setting
    return mediaQuery ? mediaQuery.matches : false;
  }

  // ----------------------------------------------------------
  // Initialization: apply theme immediately on script load
  // ----------------------------------------------------------
  applyTheme(resolveTheme());

  // ----------------------------------------------------------
  // Toggle button click handler (manual switch)
  // ----------------------------------------------------------
  if (toggle) {
    toggle.addEventListener('click', function () {
      var currentlyDark = root.classList.contains('dark');
      var newIsDark = !currentlyDark;
      try { localStorage.setItem(STORAGE_KEY, newIsDark ? 'dark' : 'light'); } catch (_) {}
      applyTheme(newIsDark);
    });
  }

  // ----------------------------------------------------------
  // System theme change listener
  // Automatically responds when OS toggles dark/light mode,
  // but only when the user has no explicit manual preference
  // ----------------------------------------------------------
  if (mediaQuery) {
    mediaQuery.addEventListener('change', function (e) {
      var saved = null;
      try { saved = localStorage.getItem(STORAGE_KEY); } catch (_) {}
      if (!saved) {
        applyTheme(e.matches);
      }
    });
  }

  // ----------------------------------------------------------
  // Public API: window._themeManager
  // Allows other modules to query or control the theme
  // ----------------------------------------------------------
  window._themeManager = {
    /** Returns 'dark' or 'light' */
    getTheme: function () {
      return root.classList.contains('dark') ? 'dark' : 'light';
    },
    /** Returns true if currently dark mode */
    isDark: function () {
      return root.classList.contains('dark');
    },
    /** Manually set theme: 'dark', 'light', or 'system' */
    setTheme: function (mode) {
      if (mode === 'system') {
        try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
        applyTheme(mediaQuery ? mediaQuery.matches : false);
      } else {
        var isDark = mode === 'dark';
        try { localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light'); } catch (_) {}
        applyTheme(isDark);
      }
    },
    /** Reset to system preference (remove manual override) */
    resetToSystem: function () {
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
      applyTheme(mediaQuery ? mediaQuery.matches : false);
    },
    /** Returns the current preference source: 'manual' or 'system' */
    getSource: function () {
      try { return localStorage.getItem(STORAGE_KEY) ? 'manual' : 'system'; } catch (_) { return 'system'; }
    },
  };
})();

// Sidebar toggle (mobile/tablet collapsible curriculum)
(function () {
  var toggleBtn = document.getElementById('sidebarToggle');
  var content = document.getElementById('sidebarContent');

  if (toggleBtn && content) {
    toggleBtn.addEventListener('click', function () {
      var expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      toggleBtn.setAttribute('aria-expanded', String(!expanded));
      if (expanded) {
        content.style.maxHeight = '0';
        content.style.overflow = 'hidden';
      } else {
        content.style.maxHeight = '';
        content.style.overflow = '';
      }
    });
  }
})();

// ============================================================
// 이어서 보기 (Resume Watching) Feature
// - localStorage에 마지막 시청 위치(강의 ID + 타임스탬프) 저장
// - 재접속 시 저장된 데이터가 있으면 안내 팝업 표시
// - '이어서 보기' 클릭 시 해당 강의 + 시점부터 재생
// - '처음부터' 클릭 시 처음부터 재생
// ============================================================
(function () {
  var STORAGE_KEY = 'jb_lessons_resume';

  var popup = document.getElementById('resumePopup');
  var closeBtn = document.getElementById('resumePopupDismiss');
  var secondaryBtn = document.getElementById('resumePopupClose');
  var resumeBtn = document.getElementById('resumePopupResume');
  var detailEl = document.getElementById('resumePopupDetail');

  // --- Utility: format seconds to mm:ss ---
  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) seconds = 0;
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function hidePopup() {
    if (popup) {
      popup.style.display = 'none';
    }
  }

  function showPopup() {
    if (popup) {
      popup.style.display = '';
    }
  }

  // --- Save progress to localStorage ---
  // Called from the Vimeo Player IIFE via window._resumeWatching.save()
  function saveProgress(lectureId, lectureName, currentTime) {
    if (!lectureId || currentTime < 5) return; // Don't save if less than 5 seconds watched
    try {
      var data = {
        lectureId: String(lectureId),
        lectureName: lectureName || '',
        currentTime: Math.floor(currentTime),
        savedAt: Date.now()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      // localStorage may be unavailable (private browsing, quota exceeded)
    }
  }

  // --- Load saved progress from localStorage ---
  function loadProgress() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      // Validate required fields
      if (!data.lectureId || typeof data.currentTime !== 'number') return null;
      // Expire after 30 days
      if (data.savedAt && (Date.now() - data.savedAt) > 30 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return data;
    } catch (e) {
      return null;
    }
  }

  // --- Clear saved progress ---
  function clearProgress() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      // ignore
    }
  }

  // --- Update popup detail text dynamically ---
  function updatePopupDetail(lectureName, currentTime) {
    if (!detailEl) return;
    var timeStr = formatTime(currentTime);
    detailEl.innerHTML =
      '<strong class="text-gray-900 dark:text-gray-100 font-medium">' +
      escapeHtml(lectureName) +
      '</strong> &middot; ' + timeStr + '에서 이어서 보기';
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Check for saved progress on page load ---
  var savedData = loadProgress();

  if (savedData && savedData.currentTime >= 5) {
    // Verify the lecture still exists in the DOM
    var curriculumNav = document.getElementById('curriculumNav');
    var targetLecture = curriculumNav
      ? curriculumNav.querySelector('[data-lecture-id="' + savedData.lectureId + '"]')
      : null;

    if (targetLecture) {
      updatePopupDetail(savedData.lectureName, savedData.currentTime);
      showPopup();

      // "이어서 보기" button - resume from saved position
      if (resumeBtn) {
        resumeBtn.addEventListener('click', function () {
          hidePopup();
          // Dispatch custom event for the Vimeo player IIFE to handle
          window.dispatchEvent(new CustomEvent('resumeWatching', {
            detail: {
              lectureId: savedData.lectureId,
              currentTime: savedData.currentTime
            }
          }));
        });
      }

      // "처음부터" button - start from the beginning of the saved lecture
      if (secondaryBtn) {
        secondaryBtn.addEventListener('click', function () {
          hidePopup();
          clearProgress();
          // Start from the beginning of that lecture
          window.dispatchEvent(new CustomEvent('resumeWatching', {
            detail: {
              lectureId: savedData.lectureId,
              currentTime: 0
            }
          }));
        });
      }
    } else {
      // Saved lecture no longer exists, clean up
      clearProgress();
    }
  }

  // Dismiss button (X) always just hides popup
  if (closeBtn) {
    closeBtn.addEventListener('click', hidePopup);
  }

  // Expose save/clear methods for the Vimeo Player IIFE
  window._resumeWatching = {
    save: saveProgress,
    clear: clearProgress
  };
})();

// ============================================================
// Vimeo Player Integration
// - Vimeo Player API 연동 및 비디오 플레이어 인터랙션
// - 배속 조절, 목차 타임점프, 영상 종료 감지
// ============================================================
(function () {
  // --- DOM References ---
  var iframe = document.getElementById('vimeoPlayer');
  var placeholder = document.getElementById('videoPlaceholder');
  var playBtn = document.getElementById('playBtn');
  var nextBtn = document.getElementById('nextBtn');
  var volumeBtn = document.getElementById('volumeBtn');
  var timeDisplay = document.getElementById('timeDisplay');
  var lectureTimeDisplay = document.getElementById('lectureTimeDisplay');
  var seekBar = document.getElementById('seekBar');
  var seekProgress = document.getElementById('seekProgress');
  var seekThumb = document.getElementById('seekThumb');
  var speedControlGroup = document.getElementById('speedControlGroup');
  var lectureInfoBar = document.getElementById('lectureInfoBar');
  var lectureProgressFill = document.getElementById('lectureProgressFill');
  var lectureProgressBar = document.getElementById('lectureProgressBar');
  var fullscreenBtn = document.getElementById('fullscreenBtn');
  var curriculumNav = document.getElementById('curriculumNav');
  var videoContainer = document.getElementById('videoContainer');

  // --- Auto Next Overlay DOM References ---
  var autoNextOverlay = document.getElementById('autoNextOverlay');
  var autoNextCountdown = document.getElementById('autoNextCountdown');
  var autoNextRing = document.getElementById('autoNextRing');
  var autoNextTitle = document.getElementById('autoNextTitle');
  var autoNextPlayNow = document.getElementById('autoNextPlayNow');
  var autoNextCancel = document.getElementById('autoNextCancel');

  if (!iframe) return;

  // --- State ---
  var player = null;
  var currentSpeed = 1;
  var videoDuration = 0;
  var isPlaying = false;
  var isSeeking = false;
  var isMuted = false;

  // Resume watching state: track current lecture info for periodic saving
  var currentLectureId = null;
  var currentLectureName = '';
  var lastSavedTime = 0;
  var SAVE_INTERVAL = 5; // Save every 5 seconds of progress change

  // Auto-next countdown state
  var COUNTDOWN_SECONDS = 5;
  var RING_CIRCUMFERENCE = 2 * Math.PI * 34; // r=34 from SVG circle
  var countdownTimer = null;
  var countdownRemaining = 0;
  var pendingNextLecture = null;

  // Course data - loaded from JSON
  var courseData = null;
  var lectureVimeoMap = {}; // Maps lecture ID to Vimeo ID

  // Demo Vimeo video ID (public sample video for development)
  var DEMO_VIMEO_ID = '76979871';

  // Load course data from JSON
  function loadCourseData() {
    return fetch('course-data.json')
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load course data');
        return res.json();
      })
      .then(function (data) {
        courseData = data;
        // Build Vimeo ID map
        if (data.sections) {
          for (var i = 0; i < data.sections.length; i++) {
            var section = data.sections[i];
            if (section.lectures) {
              for (var j = 0; j < section.lectures.length; j++) {
                var lecture = section.lectures[j];
                lectureVimeoMap[lecture.id] = lecture.vimeoId;
              }
            }
          }
        }
        console.log('[VimeoPlayer] Course data loaded:', data.courseInfo.title);
        return data;
      })
      .catch(function (err) {
        console.warn('[VimeoPlayer] Failed to load course data, using defaults:', err);
        return null;
      });
  }

  // Get Vimeo ID for a lecture
  function getVimeoIdForLecture(lectureId) {
    return lectureVimeoMap[lectureId] || DEMO_VIMEO_ID;
  }

  // Initialize current lecture info from DOM (the lecture marked as 'playing')
  (function initCurrentLectureInfo() {
    if (!curriculumNav) return;
    var activeLecture = curriculumNav.querySelector('[data-status="playing"]');
    if (activeLecture) {
      currentLectureId = activeLecture.getAttribute('data-lecture-id');
      var titleSpan = activeLecture.querySelector('.flex-1');
      currentLectureName = titleSpan ? titleSpan.textContent.trim() : '';
    }
  })();

  // SVG icons for play/pause states
  var ICON_PLAY = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  var ICON_PAUSE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
  var ICON_VOLUME_ON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>';
  var ICON_VOLUME_OFF = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>';

  // --- Utility: format seconds to mm:ss ---
  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) seconds = 0;
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  // --- Initialize Vimeo Player ---
  function initPlayer(vimeoId) {
    if (typeof Vimeo === 'undefined' || typeof Vimeo.Player === 'undefined') {
      console.warn('[VimeoPlayer] Vimeo Player SDK not loaded');
      return;
    }

    // Set iframe src to load the Vimeo video
    iframe.src = 'https://player.vimeo.com/video/' + vimeoId + '?title=0&byline=0&portrait=0&controls=0&transparent=0';

    player = new Vimeo.Player(iframe);

    // Hide placeholder once video is ready
    player.ready().then(function () {
      if (placeholder) {
        placeholder.style.display = 'none';
      }

      // Get initial duration
      return player.getDuration();
    }).then(function (dur) {
      videoDuration = dur;
      updateTimeDisplay(0, dur);

      // Apply current speed
      return player.setPlaybackRate(currentSpeed);
    }).catch(function (err) {
      console.error('[VimeoPlayer] Init error:', err);
    });

    // --- Event Listeners ---

    // Playback progress (timeupdate)
    player.on('timeupdate', function (data) {
      if (isSeeking) return;
      videoDuration = data.duration;
      var pct = data.duration > 0 ? (data.seconds / data.duration) * 100 : 0;

      updateTimeDisplay(data.seconds, data.duration);
      updateSeekBar(pct);
      updateLectureProgress(pct);

      // 이어서 보기: Save progress periodically (every SAVE_INTERVAL seconds of change)
      if (currentLectureId && Math.abs(data.seconds - lastSavedTime) >= SAVE_INTERVAL) {
        lastSavedTime = data.seconds;
        if (window._resumeWatching) {
          window._resumeWatching.save(currentLectureId, currentLectureName, data.seconds);
        }
        // 학습 진도: Periodically sync last_position to DB
        if (window._progressTracker) {
          window._progressTracker.savePosition(currentLectureId, data.seconds);
        }
      }
    });

    // Play event
    player.on('play', function () {
      isPlaying = true;
      updatePlayButton();
    });

    // Pause event
    player.on('pause', function () {
      isPlaying = false;
      updatePlayButton();

      // 이어서 보기: Save progress immediately on pause
      if (currentLectureId && window._resumeWatching) {
        player.getCurrentTime().then(function (t) {
          window._resumeWatching.save(currentLectureId, currentLectureName, t);
        }).catch(function () {});
      }
    });

    // Video ended
    player.on('ended', onVideoEnded);

    // Playback rate change
    player.on('playbackratechange', function (data) {
      currentSpeed = data.playbackRate;
      highlightActiveSpeed(currentSpeed);
    });
  }

  // --- Video End Handler ---
  function onVideoEnded() {
    isPlaying = false;
    updatePlayButton();
    updateSeekBar(100);
    updateLectureProgress(100);

    // 이어서 보기: Clear saved progress since the lecture is complete
    if (window._resumeWatching) {
      window._resumeWatching.clear();
    }

    // Mark current lecture as completed in sidebar
    var activeLecture = curriculumNav ? curriculumNav.querySelector('[data-status="playing"]') : null;
    if (activeLecture) {
      activeLecture.setAttribute('data-status', 'completed');
      activeLecture.removeAttribute('aria-current');

      // Update icon to checkmark
      var iconSpan = activeLecture.querySelector('.flex-shrink-0');
      if (iconSpan) {
        iconSpan.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
          '<circle cx="12" cy="12" r="11" class="fill-emerald-500/15 dark:fill-emerald-400/15"/>' +
          '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" class="fill-emerald-500 dark:fill-emerald-400"/>' +
          '</svg>';
        iconSpan.setAttribute('aria-label', '수강 완료');
      }

      // Update text styling
      var titleSpan = activeLecture.querySelector('.flex-1');
      if (titleSpan) {
        titleSpan.className = 'flex-1 text-sm text-gray-500 dark:text-gray-400 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis line-through decoration-gray-300 dark:decoration-gray-600';
      }

      // Update time styling
      var timeSpan = activeLecture.querySelector('.flex-shrink-0:last-child');
      if (timeSpan && timeSpan.classList.contains('font-mono')) {
        timeSpan.className = 'flex-shrink-0 text-xs text-gray-400 dark:text-gray-500 font-mono';
      }

      // Reset to default non-active styling (restore hover classes)
      activeLecture.className = 'flex items-center gap-2 px-4 md:px-6 pl-6 md:pl-8 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-[#28282e] border-l-[3px] border-transparent transition-colors duration-150';

      // 학습 진도: Update progress bars and sync to DB
      if (window._progressTracker) {
        window._progressTracker.onLectureCompleted(activeLecture.getAttribute('data-lecture-id'));
      }
    }

    // Auto-advance to next lecture with countdown overlay
    var nextLecture = findNextLecture();
    if (nextLecture) {
      startAutoNextCountdown(nextLecture);
    }
  }

  // --- Auto Next Countdown ---
  function startAutoNextCountdown(nextLectureEl) {
    if (!autoNextOverlay) {
      // Fallback: direct advance if overlay DOM not available
      selectLecture(nextLectureEl);
      return;
    }

    pendingNextLecture = nextLectureEl;
    countdownRemaining = COUNTDOWN_SECONDS;

    // Set next lecture title in the overlay
    var nextTitleSpan = nextLectureEl.querySelector('.flex-1');
    var nextTitle = nextTitleSpan ? nextTitleSpan.textContent.trim() : '다음 강의';
    if (autoNextTitle) {
      autoNextTitle.textContent = nextTitle;
    }

    // Reset ring to full (no offset = full circle)
    if (autoNextRing) {
      autoNextRing.style.transition = 'none';
      autoNextRing.style.strokeDashoffset = '0';
    }

    // Update countdown text
    if (autoNextCountdown) {
      autoNextCountdown.textContent = countdownRemaining;
    }

    // Show overlay
    autoNextOverlay.style.display = '';

    // Start draining the ring after a brief layout recalc
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (autoNextRing) {
          autoNextRing.style.transition = 'stroke-dashoffset ' + COUNTDOWN_SECONDS + 's linear';
          autoNextRing.style.strokeDashoffset = RING_CIRCUMFERENCE;
        }
      });
    });

    // Countdown timer (1-second interval)
    countdownTimer = setInterval(function () {
      countdownRemaining--;
      if (autoNextCountdown) {
        autoNextCountdown.textContent = Math.max(0, countdownRemaining);
      }

      if (countdownRemaining <= 0) {
        // Timer expired: play next lecture
        clearCountdown();
        hideAutoNextOverlay();
        if (pendingNextLecture) {
          selectLecture(pendingNextLecture);
          pendingNextLecture = null;
        }
      }
    }, 1000);
  }

  function clearCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function hideAutoNextOverlay() {
    if (autoNextOverlay) {
      autoNextOverlay.style.display = 'none';
    }
    // Reset ring
    if (autoNextRing) {
      autoNextRing.style.transition = 'none';
      autoNextRing.style.strokeDashoffset = '0';
    }
  }

  // "바로 재생" button - skip countdown, play immediately
  if (autoNextPlayNow) {
    autoNextPlayNow.addEventListener('click', function () {
      clearCountdown();
      hideAutoNextOverlay();
      if (pendingNextLecture) {
        selectLecture(pendingNextLecture);
        pendingNextLecture = null;
      }
    });
  }

  // "취소" button - cancel auto-advance
  if (autoNextCancel) {
    autoNextCancel.addEventListener('click', function () {
      clearCountdown();
      hideAutoNextOverlay();
      pendingNextLecture = null;
    });
  }

  // --- Find Next Lecture ---
  function findNextLecture() {
    if (!curriculumNav) return null;
    var allLectures = curriculumNav.querySelectorAll('[data-lecture-id]');

    // Strategy 1: Find the currently playing lecture (or the one with aria-current)
    // and return the next lecture after it
    var currentEl = curriculumNav.querySelector('[data-status="playing"]')
      || curriculumNav.querySelector('[aria-current="true"]');

    if (currentEl) {
      var foundCurrent = false;
      for (var i = 0; i < allLectures.length; i++) {
        if (allLectures[i] === currentEl) {
          foundCurrent = true;
          continue;
        }
        if (foundCurrent) {
          return allLectures[i]; // Return the very next lecture regardless of status
        }
      }
      return null; // Current lecture is the last one
    }

    // Strategy 2: No current lecture found (e.g., onVideoEnded already cleared status)
    // Use the tracked currentLectureId to locate the current position
    if (currentLectureId) {
      var currentByIdEl = curriculumNav.querySelector('[data-lecture-id="' + currentLectureId + '"]');
      if (currentByIdEl) {
        var foundById = false;
        for (var j = 0; j < allLectures.length; j++) {
          if (allLectures[j] === currentByIdEl) {
            foundById = true;
            continue;
          }
          if (foundById) {
            return allLectures[j];
          }
        }
        return null;
      }
    }

    // Strategy 3: Fallback - return the first pending lecture
    for (var k = 0; k < allLectures.length; k++) {
      if (allLectures[k].getAttribute('data-status') === 'pending') {
        return allLectures[k];
      }
    }

    return null;
  }

  // --- Select a Lecture (time-jump / load) ---
  function selectLecture(lectureEl) {
    if (!lectureEl || !curriculumNav) return;

    var lectureId = lectureEl.getAttribute('data-lecture-id');
    var titleSpan = lectureEl.querySelector('.flex-1');
    var title = titleSpan ? titleSpan.textContent.trim() : '';
    var timeSpan = lectureEl.querySelectorAll('.flex-shrink-0');
    var durationText = timeSpan.length > 1 ? timeSpan[timeSpan.length - 1].textContent.trim() : '';

    // 이어서 보기: Update current lecture tracking
    currentLectureId = lectureId;
    currentLectureName = title;
    lastSavedTime = 0;

    // Update sidebar: remove playing status from previous
    var prevPlaying = curriculumNav.querySelector('[data-status="playing"]');
    if (prevPlaying && prevPlaying !== lectureEl) {
      prevPlaying.setAttribute('data-status', 'pending');
      prevPlaying.removeAttribute('aria-current');

      // Reset to default non-active styling (restore hover classes)
      prevPlaying.className = 'flex items-center gap-2 px-4 md:px-6 pl-6 md:pl-8 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-[#28282e] border-l-[3px] border-transparent transition-colors duration-150';

      // Reset text color for pending state
      var prevTitle = prevPlaying.querySelector('.flex-1');
      if (prevTitle) {
        prevTitle.className = 'flex-1 text-sm text-gray-900 dark:text-gray-100 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis';
      }

      // Reset icon to empty circle for pending
      var prevIcon = prevPlaying.querySelector('.flex-shrink-0');
      if (prevIcon) {
        prevIcon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.5" opacity="0.3"/></svg>';
        prevIcon.setAttribute('aria-label', '미수강');
        prevIcon.className = 'flex-shrink-0 flex items-center justify-center w-5 h-5 text-gray-400 dark:text-gray-500';
      }

      // Reset time span styling
      var prevTimeSpans = prevPlaying.querySelectorAll('.flex-shrink-0');
      var prevTimeEl = prevTimeSpans.length > 1 ? prevTimeSpans[prevTimeSpans.length - 1] : null;
      if (prevTimeEl) {
        prevTimeEl.className = 'flex-shrink-0 text-xs text-gray-400 dark:text-gray-500 font-mono';
      }
    }

    // Mark new lecture as playing
    if (lectureEl.getAttribute('data-status') !== 'completed') {
      lectureEl.setAttribute('data-status', 'playing');
    }
    lectureEl.setAttribute('aria-current', 'true');

    // Apply active styling
    lectureEl.className = 'flex items-center gap-2 px-4 md:px-6 pl-6 md:pl-8 py-2 cursor-pointer bg-indigo-50 dark:bg-indigo-500/[0.08] border-l-[3px] border-indigo-600 dark:border-indigo-400 transition-colors duration-150';

    // Update icon to play icon
    var iconSpan = lectureEl.querySelector('.flex-shrink-0');
    if (iconSpan && lectureEl.getAttribute('data-status') === 'playing') {
      iconSpan.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
      iconSpan.setAttribute('aria-label', '현재 재생 중');
      iconSpan.className = 'flex-shrink-0 flex items-center justify-center w-5 h-5 text-indigo-600 dark:text-indigo-400';
    }

    // Update text to indigo
    if (titleSpan) {
      titleSpan.className = 'flex-1 text-sm text-indigo-600 dark:text-indigo-400 font-medium min-w-0 whitespace-nowrap overflow-hidden text-ellipsis';
    }

    // Update time span
    var newTimeSpans = lectureEl.querySelectorAll('.flex-shrink-0');
    var newTimeEl = newTimeSpans.length > 1 ? newTimeSpans[newTimeSpans.length - 1] : null;
    if (newTimeEl) {
      newTimeEl.className = 'flex-shrink-0 text-xs text-indigo-500 dark:text-indigo-400 font-mono font-medium';
    }

    // Open parent section if collapsed
    var parentDetails = lectureEl.closest('details');
    if (parentDetails && !parentDetails.open) {
      parentDetails.open = true;
    }

    // Update lecture info bar
    var lectureTitleEl = document.getElementById('currentLectureTitle');
    if (lectureTitleEl) {
      lectureTitleEl.textContent = title;
    }

    // Reset progress
    updateSeekBar(0);
    updateLectureProgress(0);
    updateTimeDisplay(0, 0);

    // Scroll lecture into view in sidebar
    lectureEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Load the lecture's video (each lecture has its own Vimeo ID)
    var vimeoId = getVimeoIdForLecture(lectureId);
    if (player && vimeoId) {
      // Check if we need to load a different video
      player.getVideoId().then(function (currentVimeoId) {
        if (String(currentVimeoId) !== String(vimeoId)) {
          // Different video - reload player with new video
          initPlayer(vimeoId);
        } else {
          // Same video - just restart from beginning
          player.setCurrentTime(0).then(function () {
            return player.play();
          }).catch(function (err) {
            console.error('[VimeoPlayer] Lecture switch error:', err);
          });
        }
      }).catch(function () {
        // If getVideoId fails, just reload
        initPlayer(vimeoId);
      });
    } else if (!player && vimeoId) {
      // Player not initialized yet
      initPlayer(vimeoId);
    }
  }

  // --- Play/Pause Toggle ---
  function togglePlayPause() {
    if (!player) return;
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  }

  function updatePlayButton() {
    if (!playBtn) return;
    playBtn.innerHTML = isPlaying ? ICON_PAUSE : ICON_PLAY;
    playBtn.setAttribute('aria-label', isPlaying ? '일시정지' : '재생');
  }

  // --- Time Display ---
  function updateTimeDisplay(current, duration) {
    var text = formatTime(current) + ' / ' + formatTime(duration);
    if (timeDisplay) timeDisplay.textContent = text;
    if (lectureTimeDisplay) lectureTimeDisplay.textContent = text;
  }

  // --- Seek Bar ---
  function updateSeekBar(pct) {
    pct = Math.max(0, Math.min(100, pct));
    if (seekProgress) seekProgress.style.width = pct + '%';
    if (seekThumb) seekThumb.style.left = pct + '%';
    if (seekBar) seekBar.setAttribute('aria-valuenow', Math.round(pct));
  }

  // --- Lecture Progress ---
  function updateLectureProgress(pct) {
    pct = Math.max(0, Math.min(100, pct));
    if (lectureProgressFill) lectureProgressFill.style.width = pct + '%';
    if (lectureProgressBar) {
      lectureProgressBar.setAttribute('aria-valuenow', Math.round(pct));
      lectureProgressBar.setAttribute('aria-label', '현재 강의 시청 진행률 ' + Math.round(pct) + '%');
    }
  }

  // --- Speed Control ---
  function setSpeed(rate) {
    if (!player) return;
    player.setPlaybackRate(parseFloat(rate)).catch(function (err) {
      console.warn('[VimeoPlayer] Speed change error:', err);
    });
  }

  function highlightActiveSpeed(rate) {
    // Update both desktop and mobile speed button groups
    var allSpeedBtns = document.querySelectorAll('[data-speed]');
    for (var i = 0; i < allSpeedBtns.length; i++) {
      var btn = allSpeedBtns[i];
      var btnRate = parseFloat(btn.getAttribute('data-speed'));
      var isActive = Math.abs(btnRate - rate) < 0.01;

      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');

      // Determine which style group this button belongs to
      var isInPlayerControls = btn.closest('#speedControlGroup');
      var isMobileQuick = btn.closest('[aria-label="배속 퀵 선택"]');

      if (isInPlayerControls) {
        if (isActive) {
          btn.className = btn.className
            .replace(/text-white\/50/g, 'text-white')
            .replace(/hover:bg-white\/10\s*/g, '')
            .replace(/hover:text-white\/90\s*/g, '');
          if (btn.className.indexOf('bg-indigo-600') === -1) {
            btn.className = btn.className.replace(/rounded-md\s*/, 'rounded-md bg-indigo-600 shadow-sm shadow-indigo-600/30 hover:bg-indigo-500 ');
            btn.className = btn.className.replace(/font-medium/, 'font-semibold');
          }
        } else {
          btn.className = btn.className
            .replace(/bg-indigo-600\s*/g, '')
            .replace(/shadow-sm\s*/g, '')
            .replace(/shadow-indigo-600\/30\s*/g, '')
            .replace(/hover:bg-indigo-500\s*/g, '')
            .replace(/font-semibold/g, 'font-medium');
          if (btn.className.indexOf('text-white/50') === -1) {
            btn.className = btn.className.replace(/text-white/g, 'text-white/50');
          }
          if (btn.className.indexOf('hover:bg-white/10') === -1) {
            btn.className = btn.className.replace(/rounded-md\s*/, 'rounded-md hover:bg-white/10 hover:text-white/90 ');
          }
        }
      } else if (isMobileQuick) {
        if (isActive) {
          btn.className = 'px-2 py-1 rounded-md bg-indigo-600 text-white text-xs font-semibold font-mono shadow-sm transition-colors duration-150';
        } else {
          btn.className = 'px-2 py-1 rounded-md text-gray-400 dark:text-gray-500 text-xs font-medium font-mono hover:bg-gray-200 dark:hover:bg-[#2e2e36] hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-150';
        }
      }
    }
  }

  // --- Seek Bar Click/Drag ---
  function handleSeek(e) {
    if (!seekBar || !player) return;
    var rect = seekBar.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    var targetTime = (pct / 100) * videoDuration;

    updateSeekBar(pct);
    player.setCurrentTime(targetTime).catch(function (err) {
      console.warn('[VimeoPlayer] Seek error:', err);
    });
  }

  // --- Volume Toggle ---
  function toggleMute() {
    if (!player) return;
    isMuted = !isMuted;
    player.setMuted(isMuted).catch(function () {});
    if (volumeBtn) {
      volumeBtn.innerHTML = isMuted ? ICON_VOLUME_OFF : ICON_VOLUME_ON;
      volumeBtn.setAttribute('aria-label', isMuted ? '음소거 해제' : '음소거');
    }
  }

  // --- Fullscreen ---
  function toggleFullscreen() {
    if (!videoContainer) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      videoContainer.requestFullscreen().catch(function () {});
    }
  }

  // --- Event Bindings ---

  // Play/Pause button
  if (playBtn) {
    playBtn.addEventListener('click', togglePlayPause);
  }

  // Placeholder click to start video
  if (placeholder) {
    placeholder.addEventListener('click', function () {
      if (!player) {
        initPlayer(DEMO_VIMEO_ID);
      } else {
        togglePlayPause();
      }
    });
  }

  // Next button
  if (nextBtn) {
    nextBtn.addEventListener('click', function () {
      var next = findNextLecture();
      if (next) {
        selectLecture(next);
      }
    });
  }

  // Volume button
  if (volumeBtn) {
    volumeBtn.addEventListener('click', toggleMute);
  }

  // Fullscreen button
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', toggleFullscreen);
  }

  // Speed control buttons (all data-speed buttons on the page)
  document.addEventListener('click', function (e) {
    var speedBtn = e.target.closest('[data-speed]');
    if (speedBtn) {
      var rate = speedBtn.getAttribute('data-speed');
      setSpeed(rate);
      // If player isn't initialized yet, store the speed
      currentSpeed = parseFloat(rate);
      highlightActiveSpeed(currentSpeed);
    }
  });

  // Seek bar interactions
  if (seekBar) {
    seekBar.addEventListener('click', handleSeek);

    seekBar.addEventListener('mousedown', function (e) {
      isSeeking = true;
      handleSeek(e);

      function onMouseMove(ev) {
        handleSeek(ev);
      }
      function onMouseUp() {
        isSeeking = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  // Curriculum lecture click (time-jump / lecture selection)
  if (curriculumNav) {
    curriculumNav.addEventListener('click', function (e) {
      var lectureEl = e.target.closest('[data-lecture-id]');
      if (!lectureEl) return;

      // Don't intercept clicks on section summary headers
      if (e.target.closest('summary')) return;

      e.preventDefault();

      // Initialize player if not yet loaded
      if (!player) {
        initPlayer(DEMO_VIMEO_ID);
      }

      selectLecture(lectureEl);
    });
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', function (e) {
    // Don't intercept when typing in input fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    if (!player) return;

    switch (e.key) {
      case ' ':
      case 'k':
        e.preventDefault();
        togglePlayPause();
        break;
      case 'ArrowRight':
        e.preventDefault();
        player.getCurrentTime().then(function (t) {
          player.setCurrentTime(Math.min(t + 10, videoDuration));
        });
        break;
      case 'ArrowLeft':
        e.preventDefault();
        player.getCurrentTime().then(function (t) {
          player.setCurrentTime(Math.max(t - 10, 0));
        });
        break;
      case 'f':
        e.preventDefault();
        toggleFullscreen();
        break;
      case 'm':
        e.preventDefault();
        toggleMute();
        break;
    }
  });

  // --- 이어서 보기: Listen for resume request from the popup ---
  window.addEventListener('resumeWatching', function (e) {
    var detail = e.detail;
    if (!detail || !detail.lectureId) return;

    var targetLecture = curriculumNav
      ? curriculumNav.querySelector('[data-lecture-id="' + detail.lectureId + '"]')
      : null;
    if (!targetLecture) return;

    // Initialize player if not yet loaded
    if (!player) {
      initPlayer(DEMO_VIMEO_ID);
    }

    // Select the target lecture (updates sidebar, title, etc.)
    selectLecture(targetLecture);

    // After player is ready, seek to the saved position
    var resumeTime = detail.currentTime || 0;
    if (resumeTime > 0 && player) {
      // Wait for player to be ready after lecture change, then seek
      player.ready().then(function () {
        return player.setCurrentTime(resumeTime);
      }).then(function () {
        return player.play();
      }).catch(function (err) {
        console.warn('[VimeoPlayer] Resume seek error:', err);
      });
    }
  });

  // --- 이어서 보기: Save progress on page unload ---
  window.addEventListener('beforeunload', function () {
    if (!player || !currentLectureId || !window._resumeWatching) return;
    // Use synchronous approach: read last known time from the periodic save
    // (getCurrentTime is async and may not complete before page closes)
    if (lastSavedTime > 5) {
      window._resumeWatching.save(currentLectureId, currentLectureName, lastSavedTime);
    }
  });

  // --- 이어서 보기: Also save on visibility change (tab switch, minimize) ---
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && player && currentLectureId && window._resumeWatching) {
      player.getCurrentTime().then(function (t) {
        window._resumeWatching.save(currentLectureId, currentLectureName, t);
      }).catch(function () {});
    }
  });

  // --- Initialize: Load course data on page load ---
  loadCourseData().then(function () {
    console.log('[VimeoPlayer] Ready - Lecture data loaded');
  });
})();

// ============================================================
// 학습 진도 관리 (Progress Tracking)
// - 강의 시청 완료 시 목차에 '완료' 표시 자동 반영
// - 상단 전체 코스 진행률(%) 바 실시간 업데이트
// - 섹션별 진행률 바 실시간 업데이트
// - 진도 데이터를 DB(서버 API)에 저장하고 페이지 로드 시 불러오기
// ============================================================
(function () {
  // --- Configuration ---
  // 데모 사용자 ID (인증 시스템 도입 전까지 사용)
  var DEMO_USER_ID = 1;
  // 데모 코스 ID (코스 선택 기능 도입 전까지 사용)
  var DEMO_COURSE_ID = 1;
  // DB 저장 디바운스 간격 (ms) - 너무 잦은 API 호출 방지
  var DB_SAVE_DEBOUNCE = 3000;

  // --- DOM References ---
  var curriculumNav = document.getElementById('curriculumNav');
  var headerProgressFill = document.getElementById('headerProgressFill');
  var headerProgressValue = document.getElementById('headerProgressValue');
  var sidebarProgressFill = document.getElementById('sidebarProgressFill');
  var sidebarProgressText = document.getElementById('sidebarProgressText');
  var sidebarProgress = document.getElementById('sidebarProgress');
  var headerProgressBar = document.querySelector('[aria-label*="강의 진도율"]');

  // --- State ---
  var pendingSave = null; // debounce timer for position saves
  var dbAvailable = null; // null = unchecked, true/false after first attempt

  // --- API Helper ---
  function apiRequest(method, url, body) {
    var opts = {
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (body) {
      opts.body = JSON.stringify(body);
    }
    return fetch(url, opts).then(function (res) {
      if (!res.ok) throw new Error('API error: ' + res.status);
      return res.json();
    });
  }

  // --- Check if backend API is available ---
  function checkDbAvailability() {
    return fetch('/api/health', { method: 'GET' })
      .then(function (res) {
        dbAvailable = res.ok;
        return dbAvailable;
      })
      .catch(function () {
        dbAvailable = false;
        return false;
      });
  }

  // =========================================================
  // Progress Calculation from DOM
  // =========================================================

  // Count completed and total lectures from the curriculum DOM
  function countProgress() {
    if (!curriculumNav) return { completed: 0, total: 0 };
    var allLectures = curriculumNav.querySelectorAll('[data-lecture-id]');
    var completed = 0;
    for (var i = 0; i < allLectures.length; i++) {
      if (allLectures[i].getAttribute('data-status') === 'completed') {
        completed++;
      }
    }
    return { completed: completed, total: allLectures.length };
  }

  // Count progress per section
  function countSectionProgress(sectionEl) {
    var lectures = sectionEl.querySelectorAll('[data-lecture-id]');
    var completed = 0;
    for (var i = 0; i < lectures.length; i++) {
      if (lectures[i].getAttribute('data-status') === 'completed') {
        completed++;
      }
    }
    return { completed: completed, total: lectures.length };
  }

  // =========================================================
  // UI Update Functions
  // =========================================================

  // Update overall course progress (header bar + sidebar bar)
  function updateCourseProgressUI() {
    var progress = countProgress();
    var pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

    // Header progress bar
    if (headerProgressFill) {
      headerProgressFill.style.width = pct + '%';
    }
    if (headerProgressValue) {
      headerProgressValue.textContent = pct + '%';
    }
    if (headerProgressBar) {
      headerProgressBar.setAttribute('aria-valuenow', pct);
      headerProgressBar.setAttribute('aria-label', '강의 진도율 ' + pct + '%');
    }

    // Sidebar progress bar
    if (sidebarProgressFill) {
      sidebarProgressFill.style.width = pct + '%';
    }
    if (sidebarProgressText) {
      sidebarProgressText.textContent = progress.completed + '/' + progress.total + ' 완료';
    }
    if (sidebarProgress) {
      sidebarProgress.setAttribute('aria-valuenow', pct);
      sidebarProgress.setAttribute('aria-label', '전체 강의 진도율 ' + pct + '%');
    }
  }

  // Update per-section progress bars in the curriculum sidebar
  function updateAllSectionProgressUI() {
    if (!curriculumNav) return;
    var sections = curriculumNav.querySelectorAll('details[data-section-id]');

    for (var i = 0; i < sections.length; i++) {
      var section = sections[i];
      var sp = countSectionProgress(section);
      var pct = sp.total > 0 ? Math.round((sp.completed / sp.total) * 100) : 0;

      // Find the section progress bar in the summary
      var summary = section.querySelector('summary');
      if (!summary) continue;

      var progressDiv = summary.querySelector('[role="progressbar"]');
      if (progressDiv) {
        // Update the fill bar - find the inner div inside the progress bar track
        var progressTrack = progressDiv.querySelector('div');
        var fillBar = progressTrack ? progressTrack.querySelector('div') : null;
        if (fillBar) {
          fillBar.style.width = pct + '%';
        }

        // Update the count text (e.g., "3/6")
        var countText = progressDiv.querySelector('span');
        if (countText) {
          countText.textContent = sp.completed + '/' + sp.total;
        }

        // Update ARIA attributes
        progressDiv.setAttribute('aria-valuenow', pct);
        var sectionId = section.getAttribute('data-section-id');
        progressDiv.setAttribute('aria-label', '섹션 ' + sectionId + ' 진도율 ' + pct + '%');
      }
    }
  }

  // Run all UI updates
  function refreshAllProgressUI() {
    updateCourseProgressUI();
    updateAllSectionProgressUI();
  }

  // =========================================================
  // DB Sync Functions
  // =========================================================

  // Save lecture completion to DB
  function saveLectureCompleted(lectureId) {
    if (!dbAvailable) return;
    apiRequest('PUT', '/api/progress/' + DEMO_USER_ID + '/lectures/' + lectureId, {
      last_position: 0,
      completed: true
    }).catch(function (err) {
      console.warn('[ProgressTracker] Failed to save completion to DB:', err.message);
    });
  }

  // Save current playback position to DB (debounced)
  function savePositionToDb(lectureId, position) {
    if (!dbAvailable) return;
    if (pendingSave) {
      clearTimeout(pendingSave);
    }
    pendingSave = setTimeout(function () {
      pendingSave = null;
      apiRequest('PUT', '/api/progress/' + DEMO_USER_ID + '/lectures/' + lectureId, {
        last_position: Math.floor(position),
        completed: false
      }).catch(function (err) {
        console.warn('[ProgressTracker] Failed to save position to DB:', err.message);
      });
    }, DB_SAVE_DEBOUNCE);
  }

  // Load progress from DB and apply to DOM
  function loadProgressFromDb() {
    if (!dbAvailable) return Promise.resolve(null);
    return apiRequest('GET', '/api/progress/' + DEMO_USER_ID + '/courses/' + DEMO_COURSE_ID)
      .then(function (data) {
        if (!data || !data.lecture_progress || data.lecture_progress.length === 0) {
          return null;
        }
        applyProgressToDOM(data.lecture_progress);
        return data;
      })
      .catch(function (err) {
        console.warn('[ProgressTracker] Failed to load progress from DB:', err.message);
        return null;
      });
  }

  // Apply server-loaded progress data to the sidebar DOM
  function applyProgressToDOM(lectureProgressList) {
    if (!curriculumNav) return;

    for (var i = 0; i < lectureProgressList.length; i++) {
      var lp = lectureProgressList[i];
      if (!lp.completed) continue; // Only apply completed status

      var lectureEl = curriculumNav.querySelector('[data-lecture-id="' + lp.lecture_id + '"]');
      if (!lectureEl) continue;

      // Skip if already completed or currently playing
      var currentStatus = lectureEl.getAttribute('data-status');
      if (currentStatus === 'completed' || currentStatus === 'playing') continue;

      // Mark as completed
      lectureEl.setAttribute('data-status', 'completed');

      // Update icon to checkmark
      var iconSpan = lectureEl.querySelector('.flex-shrink-0');
      if (iconSpan) {
        iconSpan.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
          '<circle cx="12" cy="12" r="11" class="fill-emerald-500/15 dark:fill-emerald-400/15"/>' +
          '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" class="fill-emerald-500 dark:fill-emerald-400"/>' +
          '</svg>';
        iconSpan.setAttribute('aria-label', '수강 완료');
      }

      // Update text styling (strikethrough + gray)
      var titleSpan = lectureEl.querySelector('.flex-1');
      if (titleSpan) {
        titleSpan.className = 'flex-1 text-sm text-gray-500 dark:text-gray-400 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis line-through decoration-gray-300 dark:decoration-gray-600';
      }

      // Update time styling
      var timeSpan = lectureEl.querySelector('.flex-shrink-0:last-child');
      if (timeSpan && timeSpan.classList.contains('font-mono')) {
        timeSpan.className = 'flex-shrink-0 text-xs text-gray-400 dark:text-gray-500 font-mono';
      }
    }

    // Refresh all progress UI after applying
    refreshAllProgressUI();
  }

  // =========================================================
  // Public API (exposed on window._progressTracker)
  // =========================================================

  // Called when a lecture finishes playing
  function onLectureCompleted(lectureId) {
    // Recalculate and update all progress bars from current DOM state
    refreshAllProgressUI();
    // Persist completion to DB
    saveLectureCompleted(lectureId);
  }

  // Called periodically during playback to save position
  function savePosition(lectureId, position) {
    savePositionToDb(lectureId, position);
  }

  // Manual refresh (e.g., after external data load)
  function refresh() {
    refreshAllProgressUI();
  }

  // =========================================================
  // Initialization
  // =========================================================

  // Initial UI sync from current DOM state (handles static HTML initial values)
  refreshAllProgressUI();

  // Check DB availability and load progress
  checkDbAvailability().then(function (available) {
    if (available) {
      console.log('[ProgressTracker] DB 연결 성공, 진도 데이터를 불러옵니다.');
      loadProgressFromDb();
    } else {
      console.log('[ProgressTracker] DB 사용 불가, 로컬 DOM 상태만 사용합니다.');
    }
  });

  // Expose public API
  window._progressTracker = {
    onLectureCompleted: onLectureCompleted,
    savePosition: savePosition,
    refresh: refresh,
    loadFromDb: loadProgressFromDb
  };
})();
