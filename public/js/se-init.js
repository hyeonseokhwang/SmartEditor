// SmartEditor2 integration shim
// Waits for SmartEditor to load and attaches paste/drop handlers to upload images
(function () {
  // Helper to get editing document from editor instance (iframe or same-page)
  function getEditorDoc(editor) {
    try {
      if (!editor) return null;
      // In classic SmartEditor2, the WYSIWYG iframe is stored at elIRFrame
      if (editor.elIRFrame && (editor.elIRFrame.contentDocument || editor.elIRFrame.contentWindow?.document)) {
        return editor.elIRFrame.contentDocument || editor.elIRFrame.contentWindow.document;
      }
      // Fallback: some builds expose WYSIWYGWindow
      if (editor.getWYSIWYGWindow && typeof editor.getWYSIWYGWindow === 'function') {
        const win = editor.getWYSIWYGWindow();
        if (win && win.document) return win.document;
      }
    } catch {}
    return null;
  }

  // Primary path: editor instance provided by caller
  window.seInitAttachToEditor = function(editor) {
    if (!editor) return;
    
    console.log('se-init: SmartEditor loaded, attaching handlers');
    
    // Get the editor's document
    try {
      const doc = getEditorDoc(editor);
      if (!doc) { console.warn('se-init: no editor document found'); return; }

      // Try to ensure editability and focus
      try {
        if (typeof editor.exec === 'function') {
          editor.exec('FOCUS');
          editor.exec('ENABLE_WYSIWYG');
        }
      } catch {}
      try {
        if (doc && typeof doc.designMode !== 'undefined') doc.designMode = 'on';
        if (doc && doc.body) {
          doc.body.contentEditable = 'true';
          doc.body.setAttribute('contenteditable', 'true');
          setTimeout(() => { try { doc.body.focus(); } catch {} }, 50);
        }
      } catch {}

      async function uploadBlob(blob, suggestedName) {
        const form = new FormData();
        form.append('file', blob, suggestedName || 'pasted.png');
        const res = await fetch('/api/upload', { method: 'POST', body: form });
        return res.json();
      }

      function isHttpUrl(u) {
        return /^https?:\/\//i.test(u);
      }

      async function replaceInlineDataAndBlobImages() {
        // Replace <img src="data:..."> and <img src="blob:..."> and non-http src
        const imgs = Array.from(doc.querySelectorAll('img'));
        for (const img of imgs) {
          const src = img.getAttribute('src') || '';
          if (!src || isHttpUrl(src)) continue;
          try {
            if (src.startsWith('data:image/')) {
              const res = await fetch('/api/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dataUrl: src }),
              });
              const data = await res.json();
              if (data.url) img.src = data.url;
            } else {
              // blob: or other same-origin resource
              const r = await fetch(src);
              const b = await r.blob();
              const data = await uploadBlob(b, (img.alt || 'pasted') + '.png');
              if (data.url) img.src = data.url;
            }
          } catch (e) {
            console.warn('se-init: failed to replace image src', src, e);
          }
        }

        // Replace inline background-image: url(data:...)
        const all = Array.from(doc.querySelectorAll('*'));
        for (const el of all) {
          const style = el.style;
          if (!style || !style.backgroundImage) continue;
          const m = style.backgroundImage.match(/url\(("|')?(.*?)(\1)?\)/i);
          if (!m) continue;
          const url = m[2] || '';
          if (!url || isHttpUrl(url)) continue;
          try {
            if (url.startsWith('data:image/')) {
              const res = await fetch('/api/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dataUrl: url }),
              });
              const data = await res.json();
              if (data.url) style.backgroundImage = `url(${data.url})`;
            } else {
              const r = await fetch(url);
              const b = await r.blob();
              const data = await uploadBlob(b, 'bg-pasted.png');
              if (data.url) style.backgroundImage = `url(${data.url})`;
            }
          } catch (e) {
            console.warn('se-init: failed to replace background image', url, e);
          }
        }
      }

      const onPaste = async (event) => {
        const items = event.clipboardData?.items || [];
        const imageItems = [];
        for (const item of items) {
          if (item.type?.indexOf && item.type.indexOf('image') === 0) imageItems.push(item);
        }
        // Case 1: Clipboard exposes image items (Chrome/Edge scenarios)
        if (imageItems.length) {
          event.preventDefault();
          for (const item of imageItems) {
            const file = item.getAsFile();
            if (!file) continue;
            try {
              const data = await uploadBlob(file, file.name || 'pasted.png');
              if (data.url) {
                const imgHtml = `<img src="${data.url}" style="max-width:100%;" alt="pasted-image" />`;
                editor.exec("PASTE_HTML", [imgHtml]);
              }
            } catch (e) {
              console.warn('se-init: upload failed', e);
            }
          }
        } else {
          // Case 2: Some apps (e.g., certain HWP scenarios) paste only markup with inline data/blob or local refs
          // Let the default paste occur, then normalize and upload what got inserted.
          setTimeout(async () => {
            // Try to detect a single pasted image selection and upload it
            try {
              const sel = (doc.getSelection && doc.getSelection()) || (doc.selection && doc.selection);
              if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0).cloneRange();
                const container = doc.createElement('div');
                container.appendChild(range.cloneContents());
                const candidateImgs = Array.from(container.querySelectorAll('img'));
                for (const cimg of candidateImgs) {
                  const src = cimg.getAttribute('src') || '';
                  if (!src) continue;
                  try {
                    if (src.startsWith('data:image/')) {
                      const res = await fetch('/api/upload', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ dataUrl: src }),
                      });
                      const data = await res.json();
                      if (data.url) editor.exec('PASTE_HTML', [`<img src="${data.url}" style="max-width:100%;" alt="pasted-image" />`]);
                    } else if (!isHttpUrl(src)) {
                      const r = await fetch(src);
                      const b = await r.blob();
                      const data = await uploadBlob(b, 'pasted.png');
                      if (data.url) editor.exec('PASTE_HTML', [`<img src="${data.url}" style="max-width:100%;" alt="pasted-image" />`]);
                    }
                  } catch (e) { /* ignore */ }
                }
              }
            } catch (e) { /* ignore */ }

            // Then do the general replacement pass on what exists in the editor
            await replaceInlineDataAndBlobImages();
          }, 150);
        }
      };

      const onDrop = async (e) => {
        const files = e.dataTransfer?.files;
        if (files && files.length) {
          e.preventDefault();
          for (const file of files) {
            if (!file.type.startsWith('image/')) continue;
            const form = new FormData();
            form.append('file', file, file.name || 'dropped.png');
            try {
              const res = await fetch('/api/upload', { method: 'POST', body: form });
              const data = await res.json();
              if (data.url) {
                const imgHtml = `<img src="${data.url}" style="max-width:100%;" alt="dropped-image" />`;
                editor.exec("PASTE_HTML", [imgHtml]);
              }
            } catch (e) {
              console.warn('se-init: drop upload failed', e);
            }
          }
        }
      };

      doc.addEventListener('paste', onPaste);
      doc.addEventListener('drop', onDrop);
      doc.addEventListener('dragover', (ev) => ev.preventDefault());

      // Force click handler to enter edit mode
      doc.addEventListener('click', (e) => {
        console.log('se-init: editor clicked, forcing focus');
        try {
          if (typeof editor.exec === 'function') {
            editor.exec('FOCUS');
            editor.exec('ENABLE_WYSIWYG');
          }
          if (doc.body) {
            doc.body.focus();
          }
        } catch {}
      });

      // Also add click handler to document to force edit mode
      doc.addEventListener('mousedown', (e) => {
        try {
          if (typeof editor.exec === 'function') {
            editor.exec('FOCUS');
            editor.exec('ENABLE_WYSIWYG');
          }
        } catch {}
      });

      console.log('se-init: attached handlers to SmartEditor document');
      
      // Force focus once more after attach
      try { 
        if (typeof editor.exec === 'function') {
          editor.exec('FOCUS');
          editor.exec('ENABLE_WYSIWYG');
        }
      } catch {}

    } catch (e) {
      console.warn('se-init: failed to attach handlers', e);
    }
  };
  
  // Fallback path: if editor is inside another iframe we embedded (legacy page)
  function attachViaIframePolling(outerIframe) {
    let tries = 0;
    const MAX_TRIES = 120; // up to ~60s if 500ms interval
    const timer = setInterval(() => {
      tries++;
      try {
        const cw = outerIframe.contentWindow;
        if (!cw) return;
        const oEditors = cw.oEditors;
        // The demo creates global oEditors, and editor can be obtained by id 'ir1' or first instance
        let editor = null;
        if (oEditors) {
          if (oEditors.getById && typeof oEditors.getById === 'object' && oEditors.getById['ir1']) {
            editor = oEditors.getById['ir1'];
          } else if (Array.isArray(oEditors) && oEditors.length > 0) {
            editor = oEditors[0];
          }
        }
        if (editor && editor.elIRFrame) {
          clearInterval(timer);
          console.log('se-init: editor found via polling fallback');
          window.seInitAttachToEditor(editor);
        }
      } catch (e) {
        // ignore cross-origin or timing issues
      }
      if (tries >= MAX_TRIES) {
        clearInterval(timer);
        console.warn('se-init: polling fallback timed out');
      }
    }, 500);
  }

  // If page still has a legacy outer iframe, hook it; otherwise, do nothing.
  window.addEventListener('load', () => {
    const outer = document.getElementById('se-iframe');
    if (outer) outer.addEventListener('load', () => attachViaIframePolling(outer));
  });
})();
