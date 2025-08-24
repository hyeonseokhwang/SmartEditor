// Minimal rich text area with paste handling for images & data URLs
// This is a placeholder for Naver SmartEditor 2.0 initialization.
// You can swap this with the actual SmartEditor load later.

const textarea = document.getElementById('editor');
const htmlOutput = document.getElementById('html-output');
const dumpBtn = document.getElementById('dump-html');

// Turn textarea into a contentEditable div while keeping simple demo
const editable = document.createElement('div');
editable.id = 'editable';
editable.contentEditable = 'true';
editable.style.minHeight = '360px';
editable.style.border = '1px solid #cbd5e1';
editable.style.borderRadius = '8px';
editable.style.padding = '12px';
editable.style.background = 'white';
textarea.replaceWith(editable);

// Paste handler: upload image files from clipboard
editable.addEventListener('paste', async (event) => {
  const items = event.clipboardData?.items || [];
  const imageItems = [];
  for (const item of items) {
    if (item.type.indexOf('image') === 0) imageItems.push(item);
  }

  if (imageItems.length) {
    event.preventDefault();

    for (const item of imageItems) {
      const file = item.getAsFile();
      if (!file) continue;

      const form = new FormData();
      form.append('file', file, file.name || 'pasted.png');
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (!data.url) continue;

      const img = document.createElement('img');
      img.src = data.url;
      img.alt = file.name || 'pasted-image';
      img.style.maxWidth = '100%';
      editable.appendChild(img);
    }
  } else {
    // Let the default paste happen first, then scan for data URLs and upload.
    // Use a microtask to run after the DOM updates.
    setTimeout(async () => {
      const imgs = editable.querySelectorAll('img');
      for (const img of imgs) {
        const src = img.getAttribute('src') || '';
        if (src.startsWith('data:image/')) {
          try {
            const res = await fetch('/api/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ dataUrl: src }),
            });
            const data = await res.json();
            if (data.url) img.src = data.url;
          } catch (e) {
            console.warn('Failed to upload pasted data URL', e);
          }
        }
      }
    });
  }
});

// Intercept drops as well
editable.addEventListener('drop', async (e) => {
  const files = e.dataTransfer?.files;
  if (files && files.length) {
    e.preventDefault();
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      const form = new FormData();
      form.append('file', file, file.name || 'drop.png');
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (!data.url) continue;
      const img = document.createElement('img');
      img.src = data.url;
      img.alt = file.name || 'dropped-image';
      img.style.maxWidth = '100%';
      editable.appendChild(img);
    }
  }
});

// Dump HTML for debug
if (dumpBtn) {
  dumpBtn.addEventListener('click', () => {
    htmlOutput.style.display = 'block';
    htmlOutput.textContent = editable.innerHTML;
  });
}

// SmartEditor 2.0 integration stub
// When replacing with SmartEditor, hook similar paste/drop handlers on its iframe/body
// and call the same /api/upload endpoint, then replace img src.
