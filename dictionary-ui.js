(() => {
  'use strict';

  const dictionary = window.localDictionary;
  const dialog = document.querySelector('#settings-dialog');
  const settingsForm = document.querySelector('#settings-form');
  const openDictionary = document.querySelector('#open-dictionary');
  const panel = document.querySelector('#dictionary-panel');
  const title = document.querySelector('#dictionary-title');
  const editorTitle = document.querySelector('#dictionary-editor-title');
  const list = document.querySelector('#dictionary-list');
  const empty = document.querySelector('#dictionary-empty');
  const form = document.querySelector('#dictionary-form');
  const keyword = document.querySelector('#dictionary-keyword');
  const description = document.querySelector('#dictionary-description');
  const editActions = document.querySelector('#dictionary-edit-actions');
  const deleteButton = document.querySelector('#dictionary-delete');
  const deleteConfirmation = document.querySelector('#dictionary-delete-confirmation');
  const deleteQuestion = document.querySelector('#dictionary-delete-question');
  const cancelDelete = document.querySelector('#dictionary-cancel-delete');
  const importButton = document.querySelector('#dictionary-import');
  const fileInput = document.querySelector('#dictionary-file');
  const status = document.querySelector('#dictionary-status');
  let selectedEntry;

  function showStatus(message = '', error = false) {
    status.toggleAttribute('data-error', error);
    status.textContent = message;
  }

  function showDeletionConfirmation(visible) {
    editActions.hidden = visible;
    deleteConfirmation.hidden = !visible;
    keyword.readOnly = visible;
    description.readOnly = visible;
  }

  function editEntry(entry) {
    selectedEntry = entry;
    keyword.value = entry?.keyword ?? '';
    description.value = entry?.description ?? '';
    editorTitle.textContent = entry ? '编辑词条' : '新增词条';
    deleteButton.hidden = !entry;
    showDeletionConfirmation(false);

    for (const button of list.querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(button.textContent === selectedEntry?.keyword));
    }
  }

  function renderEntries() {
    const entries = dictionary.list();
    const items = document.createDocumentFragment();
    for (const entry of entries) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = entry.keyword;
      button.setAttribute('aria-pressed', String(entry.keyword === selectedEntry?.keyword));
      button.addEventListener('click', () => {
        editEntry(entry);
        showStatus();
        keyword.focus();
      });
      item.append(button);
      items.append(item);
    }
    const scrollTop = list.scrollTop;
    list.replaceChildren(items);
    list.scrollTop = scrollTop;
    empty.hidden = entries.length > 0;
  }

  function showSettings() {
    panel.hidden = true;
    settingsForm.hidden = false;
    dialog.classList.remove('dictionary-open');
    dialog.setAttribute('aria-labelledby', 'settings-title');
  }

  openDictionary.addEventListener('click', () => {
    settingsForm.hidden = true;
    panel.hidden = false;
    dialog.classList.add('dictionary-open');
    dialog.setAttribute('aria-labelledby', 'dictionary-title');
    editEntry();
    showStatus();
    try {
      renderEntries();
    } catch {
      list.replaceChildren();
      empty.hidden = true;
      showStatus('无法读取本地词库，请检查当前浏览器的本地存储。', true);
    }
    title.focus();
  });

  document.querySelector('#back-settings').addEventListener('click', () => {
    showSettings();
    openDictionary.focus();
  });
  dialog.addEventListener('close', () => {
    if (!dialog.open) showSettings();
  });

  document.querySelector('#dictionary-new').addEventListener('click', () => {
    editEntry();
    showStatus();
    keyword.focus();
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!deleteConfirmation.hidden) return;
    const entry = { keyword: keyword.value.trim(), description: description.value.trim() };
    try {
      dictionary.save(entry, selectedEntry?.keyword ?? null);
      editEntry(entry);
      renderEntries();
      showStatus('词条已保存。');
    } catch (error) {
      showStatus(error.message, true);
    }
  });

  deleteButton.addEventListener('click', () => {
    deleteQuestion.textContent = '确定删除「' + selectedEntry.keyword + '」？';
    showStatus();
    showDeletionConfirmation(true);
    cancelDelete.focus();
  });
  cancelDelete.addEventListener('click', () => {
    showDeletionConfirmation(false);
    deleteButton.focus();
  });
  document.querySelector('#dictionary-confirm-delete').addEventListener('click', () => {
    try {
      dictionary.remove(selectedEntry.keyword);
      editEntry();
      renderEntries();
      showStatus('词条已删除。');
      keyword.focus();
    } catch (error) {
      showStatus(error.message, true);
    }
  });

  importButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const [file] = fileInput.files;
    fileInput.value = '';
    if (!file) return;

    importButton.disabled = true;
    showStatus('正在读取 JSON…');
    try {
      let entries;
      try {
        const source = await file.text();
        entries = JSON.parse(source.replace(/^\uFEFF/, ''));
      } catch {
        throw new Error('无法读取 JSON，请检查文件内容和导入格式。');
      }

      const { added, updated } = dictionary.importEntries(entries);
      if (dialog.open && !panel.hidden) {
        if (selectedEntry && keyword.value === selectedEntry.keyword && description.value === selectedEntry.description) {
          editEntry(dictionary.find(selectedEntry.keyword));
        }
        renderEntries();
        showStatus('导入完成，新增 ' + added + ' 条，更新 ' + updated + ' 条。');
      }
    } catch (error) {
      if (dialog.open && !panel.hidden) showStatus(error.message, true);
    } finally {
      importButton.disabled = false;
    }
  });

  document.querySelector('#dictionary-export').addEventListener('click', () => {
    try {
      const entries = dictionary.list();
      const json = JSON.stringify(entries, null, 2) + '\n';
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = '猜词现场-本地词库.json';
      link.hidden = true;
      panel.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showStatus('已生成包含 ' + entries.length + ' 条词条的 JSON 文件。');
    } catch (error) {
      showStatus(error.message, true);
    }
  });
})();
