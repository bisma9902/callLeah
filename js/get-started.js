(function () {
  "use strict";

  const STORAGE_KEY = "callleah_onboarding_state";
  const CAL_LINK = "alihaa-kalsoomm113-mojs5c/30min";
  const CAL_ORIGIN = "https://app.cal.com";

  const defaultState = {
    step: 1,
    fullName: "",
    email: "",
    phone: "",
    phoneCountry: "",
    businessType: "",
    businessTypeOther: "",
    needs: [],
    needsOther: "",
    problem: "",
    problemOther: "",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    booking: null
  };

  let state = loadState();
  let calInitialized = false;
  let calSuccessHandled = false;
  const touched = new Set();
  let phoneUtilsReady = false;

  function loadState() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? Object.assign({}, defaultState, JSON.parse(raw)) : Object.assign({}, defaultState);
    } catch (_) {
      return Object.assign({}, defaultState);
    }
  }

  function saveState() {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  const $ = (id) => document.getElementById(id);

  const els = {
    form: $("detailsForm"),
    fullName: $("fullName"),
    email: $("email"),
    phone: $("phone"),
    phoneField: $("field-phone"),
    phoneError: $("phoneError"),
    businessTypeGrid: $("businessTypeGrid"),
    businessTypeOther: $("businessTypeOther"),
    businessTypeOtherWrap: $("businessTypeOtherWrap"),
    needsOther: $("needsOther"),
    needsOtherWrap: $("needsOtherWrap"),
    problemOther: $("problemOther"),
    problemOtherWrap: $("problemOtherWrap"),
    needsGrid: $("needsGrid"),
    problemGrid: $("problemGrid"),
    submit: $("step1Submit"),
    calLoading: $("calLoading"),
    calShell: $("calcomShell"),
    bookingError: $("bookingError"),
    bookingErrorText: $("bookingErrorText"),
    backToStep1: $("backToStep1"),
    confirmDetails: $("confirmDetails"),
    pageHeading: $("pageHeading"),
    pageSub: $("pageSub")
  };

  /* ---------- International phone input ---------- */
  let phoneInput = null;

  if (window.intlTelInput) {
    phoneInput = window.intlTelInput(els.phone, {
      initialCountry: state.phoneCountry || "auto",
      nationalMode: true,
      separateDialCode: true,
      preferredCountries: ["pk", "us", "gb", "ae", "ca"],
      geoIpLookup: function (callback) {
        fetch("https://ipapi.co/json/")
          .then(r => r.json())
          .then(data => callback((data && data.country_code) || "pk"))
          .catch(() => callback("pk"));
      },
      utilsScript: "https://cdn.jsdelivr.net/npm/intl-tel-input@25.3.1/build/js/utils.js"
    });

    if (state.phone) {
      try { phoneInput.setNumber(state.phone); } catch (_) { els.phone.value = state.phone; }
    }

    // intl-tel-input loads its validation utilities asynchronously. Do not
    // mark a correct number invalid while those utilities are still loading.
    els.phone.addEventListener("utilsLoaded", () => {
      phoneUtilsReady = true;
      if (touched.has("field-phone")) validatePhone();
      validateForm();
    });
  }

  /* ---------- Options ---------- */
  const BUSINESS_TYPE_OPTIONS = [
    "Dental",
    "HVAC",
    "Plumbing",
    "Salon / Beauty",
    "Cleaning",
    "Legal",
    "Healthcare",
    "Home Services",
    "Real Estate",
    "Other"
  ];

  const NEEDS_OPTIONS = [
    "Answer incoming calls",
    "Answer frequently asked questions",
    "Capture leads/customer information",
    "Book appointments",
    "Check calendar availability",
    "Transfer calls to staff",
    "Other"
  ];

  const PROBLEM_OPTIONS = [
    "Missing calls",
    "Calls after business hours",
    "Staff are too busy to answer",
    "Too many repetitive questions",
    "Difficulty booking appointments",
    "Other"
  ];

  function checkSvg() {
    return '<svg viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  BUSINESS_TYPE_OPTIONS.forEach((label, i) => {
    const id = "biztype_" + i;
    const card = document.createElement("label");
    card.className = "option-card";
    card.htmlFor = id;
    card.innerHTML = `
      <input type="radio" name="businessType" id="${id}" value="${escapeHtml(label)}">
      <span class="option-marker radio"></span>
      <span>${escapeHtml(label)}</span>`;
    els.businessTypeGrid.appendChild(card);
  });

  NEEDS_OPTIONS.forEach((label, i) => {
    const id = "need_" + i;
    const card = document.createElement("label");
    card.className = "option-card";
    card.htmlFor = id;
    card.innerHTML = `
      <input type="checkbox" id="${id}" value="${escapeHtml(label)}">
      <span class="option-marker checkbox">${checkSvg()}</span>
      <span>${escapeHtml(label)}</span>`;
    els.needsGrid.appendChild(card);
  });

  PROBLEM_OPTIONS.forEach((label, i) => {
    const id = "problem_" + i;
    const card = document.createElement("label");
    card.className = "option-card";
    card.htmlFor = id;
    card.innerHTML = `
      <input type="radio" name="problem" id="${id}" value="${escapeHtml(label)}">
      <span class="option-marker radio"></span>
      <span>${escapeHtml(label)}</span>`;
    els.problemGrid.appendChild(card);
  });

  restoreForm();
  syncVisuals();
  validateForm();

  function restoreForm() {
    els.fullName.value = state.fullName;
    els.email.value = state.email;
    els.businessTypeOther.value = state.businessTypeOther;
    els.needsOther.value = state.needsOther;
    els.problemOther.value = state.problemOther;

    const businessType = els.businessTypeGrid.querySelector(`input[value="${CSS.escape(state.businessType)}"]`);
    if (businessType) businessType.checked = true;

    state.needs.forEach(value => {
      const input = Array.from(els.needsGrid.querySelectorAll("input")).find(i => i.value === value);
      if (input) input.checked = true;
    });

    const problem = els.problemGrid.querySelector(`input[value="${CSS.escape(state.problem)}"]`);
    if (problem) problem.checked = true;

    updateConditionalFields();
  }

  function syncVisuals() {
    document.querySelectorAll(".option-card").forEach(card => {
      const input = card.querySelector("input");
      card.classList.toggle("selected", !!input.checked);
    });
  }

  function updateConditionalFields() {
    const otherBusiness = (els.businessTypeGrid.querySelector("input:checked")?.value || "") === "Other";
    els.businessTypeOtherWrap.style.display = otherBusiness ? "block" : "none";

    const otherNeed = Array.from(els.needsGrid.querySelectorAll("input:checked")).some(i => i.value === "Other");
    els.needsOtherWrap.style.display = otherNeed ? "block" : "none";

    const otherProblem = Array.from(els.problemGrid.querySelectorAll("input:checked")).some(i => i.value === "Other");
    els.problemOtherWrap.style.display = otherProblem ? "block" : "none";
  }

  function setError(id, hasError) {
    const field = $(id);
    if (field) field.classList.toggle("has-error", hasError);
  }

  function validName(value) {
    return /^[\p{L}][\p{L}\p{M}'’.\- ]{1,99}$/u.test(value.trim());
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
  }

  function validatePhone(showError = touched.has("field-phone")) {
    const raw = els.phone.value.trim();
    if (!raw) {
      setError("field-phone", false);
      return true;
    }

    // If the country selector is Pakistan and a user pasted a common
    // international form such as "92 3185074686", normalize it to the
    // national part before asking intl-tel-input to validate it. The country
    // selector already supplies +92, so entering 92 again would otherwise
    // create an invalid +9292... number.
    if (phoneInput) {
      const country = phoneInput.getSelectedCountryData()?.iso2;
      const digits = raw.replace(/\D/g, "");
      if (country === "pk" && /^92(?:0)?3\d{9}$/.test(digits)) {
        const national = digits.replace(/^920?/, "");
        els.phone.value = national;
      }

      // Until the library's async utilities are ready, don't punish the user
      // with a false validation error. We validate again as soon as they load.
      if (!phoneUtilsReady) {
        if (showError) setError("field-phone", false);
        return true;
      }

      const valid = phoneInput.isValidNumber();
      if (showError) setError("field-phone", !valid);
      return valid;
    }

    const valid = /^[0-9+().\-\s]{7,25}$/.test(raw);
    if (showError) setError("field-phone", !valid);
    return valid;
  }

  function validateForm() {
    const name = els.fullName.value.trim();
    const email = els.email.value.trim();
    const business = els.businessTypeGrid.querySelector("input:checked")?.value || "";
    const needs = Array.from(els.needsGrid.querySelectorAll("input:checked")).map(i => i.value);
    const problem = els.problemGrid.querySelector("input:checked")?.value || "";

    const validNameValue = validName(name);
    const validEmailValue = validEmail(email);
    const validPhoneValue = validatePhone();
    const validBusiness = !!business && (business !== "Other" || els.businessTypeOther.value.trim().length >= 2);
    const validNeeds = needs.length > 0 && (!needs.includes("Other") || els.needsOther.value.trim().length >= 2);
    const validProblem = !!problem && (problem !== "Other" || els.problemOther.value.trim().length >= 2);

    if (touched.has("field-fullName")) setError("field-fullName", !validNameValue);
    if (touched.has("field-email")) setError("field-email", !validEmailValue);
    if (touched.has("field-phone")) setError("field-phone", !validPhoneValue);
    if (touched.has("field-businessType")) setError("field-businessType", !validBusiness);
    if (touched.has("field-needs")) setError("field-needs", !validNeeds);
    if (touched.has("field-problem")) setError("field-problem", !validProblem);

    const allValid = validNameValue && validEmailValue && validPhoneValue &&
      validBusiness && validNeeds && validProblem;

    els.submit.disabled = !allValid;
    return allValid;
  }

  function collectState() {
    state.fullName = els.fullName.value.trim();
    state.email = els.email.value.trim();
    state.businessType = els.businessTypeGrid.querySelector("input:checked")?.value || "";
    state.businessTypeOther = els.businessTypeOther.value.trim();
    state.needs = Array.from(els.needsGrid.querySelectorAll("input:checked")).map(i => i.value);
    state.needsOther = els.needsOther.value.trim();
    state.problem = els.problemGrid.querySelector("input:checked")?.value || "";
    state.problemOther = els.problemOther.value.trim();

    if (phoneInput) {
      state.phone = els.phone.value.trim() ? phoneInput.getNumber() : "";
      state.phoneCountry = phoneInput.getSelectedCountryData()?.iso2 || "";
    } else {
      state.phone = els.phone.value.trim();
    }

    saveState();
  }

  [
    els.fullName, els.email, els.phone,
    els.businessTypeOther, els.needsOther, els.problemOther
  ].forEach(el => {
    const fieldId = el === els.fullName ? "field-fullName" :
      el === els.email ? "field-email" :
      el === els.phone ? "field-phone" :
      el === els.businessTypeOther ? "field-businessType" :
      el === els.needsOther ? "field-needs" : "field-problem";

    el.addEventListener("input", () => {
      touched.add(fieldId);
      collectState();
      validateForm();
    });
    el.addEventListener("change", () => {
      touched.add(fieldId);
      updateConditionalFields();
      syncVisuals();
      collectState();
      validateForm();
    });
  });

  document.addEventListener("change", (event) => {
    if (event.target.matches('#needsGrid input, #problemGrid input, #businessTypeGrid input')) {
      const fieldId = event.target.closest('#needsGrid') ? "field-needs" :
        event.target.closest('#problemGrid') ? "field-problem" : "field-businessType";
      touched.add(fieldId);
      updateConditionalFields();
      syncVisuals();
      collectState();
      validateForm();
    }
  });

  els.form.addEventListener("submit", function (event) {
    event.preventDefault();
    ["field-fullName", "field-email", "field-phone", "field-businessType", "field-needs", "field-problem"].forEach(id => touched.add(id));
    if (!validateForm()) {
      const firstError = document.querySelector(".field.has-error");
      if (firstError) firstError.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    collectState();
    state.step = 2;
    saveState();
    goToStep(2);
    initializeCal();
  });

  function buildCalMetadata() {
    const businessType = state.businessType === "Other" ? state.businessTypeOther : state.businessType;
    const needs = state.needs.map(v => v === "Other" ? state.needsOther : v);
    const problem = state.problem === "Other" ? state.problemOther : state.problem;

    return {
      "metadata[callLeahBusinessType]": businessType,
      "metadata[callLeahAiReceptionistNeeds]": needs.join(", "),
      "metadata[callLeahBiggestCallProblem]": problem,
      "metadata[callLeahPhone]": state.phone || "",
      "metadata[callLeahSource]": "CallLeah website",
      "metadata[callLeahFullName]": state.fullName
    };
  }

  function initializeCal() {
    if (calInitialized) return;
    calInitialized = true;

    if (!window.Cal) {
      showBookingError("The booking calendar could not be loaded. Please refresh the page and try again.");
      return;
    }

    const config = Object.assign({
      name: state.fullName,
      email: state.email
    }, buildCalMetadata());

    if (state.phone) {
      config["metadata[callLeahPhone]"] = state.phone;
    }

    try {
      Cal.ns["30min"]("on", {
        action: "bookingSuccessfulV2",
        callback: function (e) {
          handleCalBooking(e?.detail?.data || {});
        }
      });

      Cal.ns["30min"]("on", {
        action: "linkFailed",
        callback: function (e) {
          const data = e?.detail?.data || {};
          showBookingError(data.msg || "The booking calendar could not be loaded. Please refresh and try again.");
        }
      });

      Cal.ns["30min"]("inline", {
        elementOrSelector: "#my-cal-inline-30min",
        config: Object.assign({
          layout: "month_view",
          useSlotsViewOnSmallScreen: "true"
        }, config),
        calLink: CAL_LINK
      });

      Cal.ns["30min"]("ui", {
        theme: "dark",
        hideEventTypeDetails: false,
        layout: "month_view",
        styles: {
          branding: { brandColor: "#4A6CFF" }
        },
        cssVarsPerTheme: {
          dark: {
            "cal-bg": "#0A0E1A",
            "cal-bg-emphasis": "#10162A",
            "cal-bg-subtle": "#171F38",
            "cal-bg-muted": "#10162A",
            "cal-border": "rgba(255,255,255,0.09)",
            "cal-border-emphasis": "rgba(255,255,255,0.16)",
            "cal-border-subtle": "rgba(255,255,255,0.09)",
            "cal-border-booker": "rgba(255,255,255,0.09)",
            "cal-text": "#F3F4F8",
            "cal-text-emphasis": "#F3F4F8",
            "cal-text-subtle": "#9AA2B8",
            "cal-text-muted": "#9AA2B8",
            "cal-brand": "#4A6CFF",
            "cal-brand-emphasis": "#8C6BFF",
            "cal-brand-text": "#FFFFFF"
          }
        }
      });

      setTimeout(() => {
        els.calLoading.style.display = "none";
      }, 1200);
    } catch (error) {
      console.error(error);
      showBookingError("The booking calendar could not be loaded. Please refresh the page and try again.");
    }
  }

  function handleCalBooking(data) {
    if (calSuccessHandled) return;
    calSuccessHandled = true;

    const start = data.startTime ? new Date(data.startTime) : null;
    const timezone = state.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    state.booking = {
      bookingId: data.uid || "",
      title: data.title || "CallLeah Consultation",
      confirmedDate: start ? formatDateInZone(start, timezone) : "",
      confirmedTime: start ? formatTimeInZone(start, timezone) : "",
      timeZone: timezone,
      meetingLink: data.videoCallUrl || ""
    };

    saveState();
    renderConfirmation();
    goToStep(3);
  }

  function formatDateInZone(date, timezone) {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: timezone
    }).format(date);
  }

  function formatTimeInZone(date, timezone) {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      timeZone,
      timeZoneName: "short"
    }).format(date);
  }

  function renderConfirmation() {
    const b = state.booking;
    if (!b) return;

    const details = [
      ["Client", state.fullName],
      ["Meeting Date", b.confirmedDate || "Confirmed in Cal.com"],
      ["Meeting Time", b.confirmedTime || "Confirmed in Cal.com"],
      ["Time Zone", b.timeZone || state.timeZone]
    ];

    els.confirmDetails.innerHTML = details.map(([k, v]) => `
      <div class="detail-item">
        <div class="k">${escapeHtml(k)}</div>
        <div class="v">${escapeHtml(v)}</div>
      </div>
    `).join("");

    if (b.meetingLink) {
      els.confirmDetails.innerHTML += `
        <div class="detail-item meeting-link-item">
          <div class="k">Meeting Link</div>
          <div class="v">
            <a class="meeting-link" href="${escapeAttr(b.meetingLink)}" target="_blank" rel="noopener noreferrer">Join Meeting →</a>
          </div>
        </div>`;
    } else {
      els.confirmDetails.innerHTML += `
        <div class="detail-item">
          <div class="k">Meeting Details</div>
          <div class="v">Your meeting details are included in your Cal.com confirmation email.</div>
        </div>`;
    }
  }

  function showBookingError(message) {
    els.bookingErrorText.textContent = message;
    els.bookingError.classList.add("show");
  }

  els.backToStep1.addEventListener("click", function (event) {
    event.preventDefault();
    goToStep(1);
  });

  function goToStep(n) {
    state.step = n;
    saveState();

    document.querySelectorAll(".step-panel").forEach(panel => panel.classList.remove("active"));
    const target = $("step-" + n);
    if (target) target.classList.add("active");

    [1, 2, 3].forEach(i => {
      const el = document.querySelector(`.progress-step[data-progress="${i}"]`);
      el.classList.remove("active", "done");
      if (i < n) el.classList.add("done");
      if (i === n) el.classList.add("active");
    });

    const headings = {
      1: [
        "Let's Build Your AI Receptionist",
        "Tell us a little about your business and book a quick consultation. We'll discuss your needs and show you how CallLeah can be customised for your business."
      ],
      2: [
        "Book Your Consultation",
        "Choose a convenient time for a quick consultation. We'll discuss your business and how your AI receptionist can be customised for you."
      ],
      3: [
        "You're All Set! 🎉",
        "Your consultation has been booked."
      ]
    };

    els.pageHeading.textContent = headings[n][0];
    els.pageSub.textContent = headings[n][1];
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
  }

  function escapeAttr(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* Cal's loader script. The real booking UI is inserted only after Step 1
     has passed validation. */
  (function (C, A, L) {
    let p = function (a, ar) { a.q.push(ar); };
    let d = C.document;
    C.Cal = C.Cal || function () {
      let cal = C.Cal;
      let ar = arguments;

      if (!cal.loaded) {
        cal.ns = {};
        cal.q = cal.q || [];
        d.head.appendChild(d.createElement("script")).src = A;
        cal.loaded = true;
      }

      if (ar[0] === L) {
        const api = function () { p(api, arguments); };
        const namespace = ar[1];
        api.q = api.q || [];

        if (typeof namespace === "string") {
          cal.ns[namespace] = cal.ns[namespace] || api;
          p(cal.ns[namespace], ar);
          p(cal, ["initNamespace", namespace]);
        } else {
          p(cal, ar);
        }
        return;
      }

      p(cal, ar);
    };
  })(window, "https://app.cal.com/embed/embed.js", "init");

  Cal("init", "30min", { origin: CAL_ORIGIN });
  Cal.config = Cal.config || {};
  Cal.config.forwardQueryParams = true;

  /* If a previous confirmed booking exists, resume the real confirmation state.
     Otherwise always start at Step 1. */
  if (state.booking && state.step === 3) {
    renderConfirmation();
    goToStep(3);
  } else {
    state.step = 1;
    saveState();
    goToStep(1);
  }
})();
