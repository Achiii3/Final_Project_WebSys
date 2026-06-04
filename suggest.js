// suggest.js — client-side handling for suggest.html (merged + enhanced)

(function () {
  const form = document.getElementById('suggestForm');
  const placeName = document.getElementById('placeName');
  const locationInput = document.getElementById('location');
  const description = document.getElementById('description');
  const photoInput = document.getElementById('photo');
  const formMessage = document.getElementById('formMessage');
  const clearBtn = document.getElementById('clearBtn');

  // Optional UI elements (if present in your HTML)
  const photoPreview = document.getElementById('photoPreview');
  const fileMeta = document.getElementById('fileMeta');
  const confirmationCard = document.getElementById('confirmationCard');
  const confirmThumb = document.getElementById('confirmThumb');
  const confirmName = document.getElementById('confirmName');
  const confirmLocation = document.getElementById('confirmLocation');
  const confirmDesc = document.getElementById('confirmDesc');
  const addAnotherBtn = document.getElementById('addAnotherBtn');
  const viewSpotsBtn = document.getElementById('viewSpotsBtn');

  const STORAGE_KEY = 'studysite_suggestions_v1';

  /* -------------------------
     Helpers
     ------------------------- */

  // Normalize text for safe insertion
  function sanitize(s) {
    return String(s || '').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  }

  // Read selected tags
  function getSelectedTags() {
    return Array.from(document.querySelectorAll('input[name="tags"]:checked')).map(i => i.value);
  }

  // Read safety
  function getSafety() {
    const r = document.querySelector('input[name="safety"]:checked');
    return r ? r.value : 'Safe';
  }

  // Convert small image to data URL (fallback simple reader)
  function readPhotoAsDataURL(file) {
    return new Promise((resolve) => {
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  // Resize image client-side to avoid localStorage quota issues
  async function fileToResizedDataURL(file, maxWidth = 1200, quality = 0.8) {
    if (!file) return null;
    if (!file.type.startsWith('image/')) return null;

    // Load image
    const img = await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = reader.result;
      };
      reader.onerror = rej;
      reader.readAsDataURL(file);
    }).catch(() => null);

    if (!img) return null;

    const ratio = img.width / img.height;
    const width = Math.min(maxWidth, img.width);
    const height = Math.round(width / ratio);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    return canvas.toDataURL('image/jpeg', quality);
  }

  /* -------------------------
     Tag chip toggle behavior
     ------------------------- */

  (function wireTagChips() {
    const tagChips = Array.from(document.querySelectorAll('.tag-checkbox'));
    if (!tagChips.length) return;

    tagChips.forEach(label => {
      const input = label.querySelector('input[type="checkbox"]');

      // Initialize visual state
      if (input && input.checked) label.classList.add('selected');

      // When checkbox changes, toggle visual class
      if (input) {
        input.addEventListener('change', () => {
          label.classList.toggle('selected', input.checked);
        });
      }

      // Make the label keyboard-focusable and toggle on Enter/Space
      label.setAttribute('tabindex', '0');
      label.addEventListener('keydown', (ev) => {
        if (ev.key === ' ' || ev.key === 'Enter') {
          ev.preventDefault();
          if (input) {
            input.checked = !input.checked;
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      });

      // Clicking the label toggles the checkbox (works even if click target isn't the input)
      label.addEventListener('click', (ev) => {
        if (ev.target.tagName.toLowerCase() === 'input') return;
        if (input) {
          input.checked = !input.checked;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    });
  })();

  /* -------------------------
     Photo preview handling
     ------------------------- */

  if (photoInput) {
    photoInput.addEventListener('change', async () => {
      const file = photoInput.files && photoInput.files[0];
      if (!file) {
        if (photoPreview) photoPreview.innerHTML = 'No Photo';
        if (fileMeta) fileMeta.textContent = 'No file chosen';
        return;
      }

      if (fileMeta) fileMeta.textContent = `${file.name} • ${(file.size / 1024 | 0)} KB`;

      // Warn if large original
      if (file.size > 2_500_000 && formMessage) {
        formMessage.textContent = 'Large image detected. It will be resized automatically.';
        formMessage.className = 'msg';
        formMessage.style.color = '#b45a00';
      } else if (formMessage) {
        formMessage.textContent = '';
        formMessage.className = '';
      }

      // Try to resize for preview
      const data = await fileToResizedDataURL(file, 1200, 0.8).catch(() => null);
      if (data) {
        if (photoPreview) photoPreview.innerHTML = '<img alt="photo preview" src="' + sanitize(data) + '">';
      } else {
        // fallback to simple data URL read
        const fallback = await readPhotoAsDataURL(file);
        if (fallback && photoPreview) photoPreview.innerHTML = '<img alt="photo preview" src="' + sanitize(fallback) + '">';
        else if (photoPreview) photoPreview.textContent = 'No Photo';
      }
    });
  }

  /* -------------------------
     Save suggestion
     ------------------------- */

  async function saveSuggestion(e) {
    e.preventDefault();
    if (formMessage) {
      formMessage.textContent = '';
      formMessage.className = '';
    }

    // Basic validation
    if (!placeName.value.trim()) {
      if (formMessage) { formMessage.textContent = 'Please enter the place name.'; formMessage.className = 'msg error'; }
      placeName.focus();
      return;
    }
    if (!locationInput.value.trim()) {
      if (formMessage) { formMessage.textContent = 'Please enter the location.'; formMessage.className = 'msg error'; }
      locationInput.focus();
      return;
    }
    if (!description.value.trim()) {
      if (formMessage) { formMessage.textContent = 'Please add a short description.'; formMessage.className = 'msg error'; }
      description.focus();
      return;
    }

    // Read and resize photo (if any)
    const file = photoInput.files && photoInput.files[0];
    let photoData = null;
    if (file) {
      photoData = await fileToResizedDataURL(file, 1200, 0.8).catch(() => null);
      if (!photoData) {
        // fallback to simple read
        photoData = await readPhotoAsDataURL(file);
      }
    }

    const suggestion = {
      id: 'sugg_' + Date.now(),
      name: placeName.value.trim(),
      location: locationInput.value.trim(),
      description: description.value.trim(),
      tags: getSelectedTags(),
      safety: getSafety(),
      photo: photoData, // data URL or null
      submittedAt: new Date().toISOString()
    };

    // Load existing suggestions
    let list = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      list = raw ? JSON.parse(raw) : [];
    } catch (err) {
      list = [];
    }

    list.push(suggestion);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      // small helper flag and custom event so Spots page can react immediately
      try { localStorage.setItem('studysite_last_submitted', suggestion.id); } catch (e) { /* ignore */ }
      window.dispatchEvent(new CustomEvent('suggestion:added', { detail: suggestion }));
    } catch (err) {
      if (formMessage) {
        formMessage.textContent = 'Could not save suggestion. Image may be too large for local storage.';
        formMessage.className = 'msg error';
      }
      return;
    }

    // UI feedback: show confirmation card if present, otherwise show inline message
    if (confirmationCard && confirmName && confirmLocation && confirmDesc && confirmThumb) {
      confirmName.textContent = suggestion.name;
      confirmLocation.textContent = suggestion.location;
      confirmDesc.textContent = suggestion.description;
      if (suggestion.photo) {
        confirmThumb.innerHTML = '<img src="' + sanitize(suggestion.photo) + '" alt="' + sanitize(suggestion.name) + '">';
      } else {
        confirmThumb.textContent = 'No Photo';
      }
      confirmationCard.style.display = 'block';
      confirmationCard.setAttribute('aria-hidden', 'false');
      // hide form card if present
      const formCard = document.getElementById('formCard');
      if (formCard) formCard.style.display = 'none';
    } else {
      // fallback inline message
      if (formMessage) {
        formMessage.textContent = `✅ "${suggestion.name}" has been submitted successfully!`;
        formMessage.className = 'msg success';
        formMessage.style.color = '#1b5e20';
      }
      form.reset();
      if (photoPreview) photoPreview.innerHTML = 'No Photo';
      if (fileMeta) fileMeta.textContent = 'No file chosen';
    }
  }

  /* -------------------------
     Clear form handler
     ------------------------- */

  function clearForm() {
    form.reset();
    if (formMessage) { formMessage.textContent = ''; formMessage.className = ''; }
    if (photoPreview) photoPreview.innerHTML = 'No Photo';
    if (fileMeta) fileMeta.textContent = 'No file chosen';
    placeName.focus();
  }

  /* -------------------------
     Confirmation card actions
     ------------------------- */

  if (addAnotherBtn) {
    addAnotherBtn.addEventListener('click', () => {
      if (confirmationCard) {
        confirmationCard.style.display = 'none';
        confirmationCard.setAttribute('aria-hidden', 'true');
      }
      const formCard = document.getElementById('formCard');
      if (formCard) formCard.style.display = '';
      form.reset();
      if (photoPreview) photoPreview.innerHTML = 'No Photo';
      if (fileMeta) fileMeta.textContent = 'No file chosen';
      placeName.focus();
    });
  }

  // viewSpotsBtn is a normal link to spots.html if present; no extra wiring required

  /* -------------------------
     Attach events & init
     ------------------------- */

  if (form) form.addEventListener('submit', saveSuggestion);
  if (clearBtn) clearBtn.addEventListener('click', clearForm);

  // Focus first input on load
  window.addEventListener('DOMContentLoaded', () => {
    placeName.focus();
  });

  // Expose small helpers for debugging if needed
  window.__suggestHelpers = {
    STORAGE_KEY,
    fileToResizedDataURL,
    readPhotoAsDataURL
  };
})();
