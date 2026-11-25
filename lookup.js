(() => {
  const form = document.querySelector('#lookup-form');
  const query = document.querySelector('#query');
  const card = document.querySelector('#entry');

  function updateCard() {
    card.hidden = query.value.trim() !== '囚牛';
    query.setCustomValidity('');
  }

  query.addEventListener('input', updateCard);
  window.addEventListener('pageshow', updateCard);
  form.addEventListener('submit', event => {
    query.value = query.value.trim();
    if (!query.value) {
      event.preventDefault();
      query.setCustomValidity('请输入要查的词。');
      query.reportValidity();
    }
  });
})();
