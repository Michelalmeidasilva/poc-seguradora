/* global window, document, location, history, navigator, FormData, setTimeout, clearTimeout */
(() => {
  const { groups, index, total } = window.EXPERIENCE;
  const $ = (id) => document.getElementById(id);
  const escape = (value) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const memory = {
    name: 'Maria Silva',
    birth: '12/03/2014',
    maskedDocument: '•••.•••.•••-09',
    relationship: 'Filha',
    phone: '',
    biologicalSex: '',
    cancelReason: '',
    postal: '01000-000',
    address: 'Rua das Flores, 100',
    city: 'São Paulo / SP',
    funeralCity: 'São Paulo',
    funeralState: 'SP',
    eventDate: '09/10/2026',
    eventPlace: 'São Paulo / SP',
  };
  let current = index[location.hash.slice(1)] ? location.hash.slice(1) : 'DEP-01';
  let stateFilter = 'all';
  let query = '';
  let galleryVisible = false;
  let light = false;
  let additions = [];
  let selectedContract = 'Serviços de Assistência';
  let selectedPlan = 'Familiar';
  const discoveryState = { page: 0, service: null, modality: null, intent: null };
  let identityReturn = 'CON-02';
  let authenticatedUntil = 0;
  let sessionTimer;
  const isAuthenticated = () => Date.now() < authenticatedUntil;
  function validCpf(value) {
    return /^(?:[0-9]{11}|[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2})$/.test(String(value).trim());
  }
  let toastTimer;
  const modeLabels = {
    chat: 'Conversa',
    form: 'WhatsApp Flow · formulário',
    list: 'Lista de seleção',
    review: 'WhatsApp Flow · revisão',
    document: 'Documentos',
    audio: 'Áudio + conversa',
  };
  const groupFor = (step) => groups.find((group) => group.code === step.journey);
  const interpolate = (value) => {
    let text = String(value ?? '').replace(
      /\{\{(\w+)\}\}/g,
      (_, key) => memory[key] || 'Não informado',
    );
    if (selectedPlan === 'Individual' && ['DES', 'ADE', 'PAG'].includes(index[current]?.journey)) {
      text = text.replaceAll('Familiar', 'Individual').replaceAll('R$ 39,90', 'R$ 29,90');
    }
    return text;
  };
  const format = (value) =>
    escape(interpolate(value)).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  function toast(message) {
    $('toast').textContent = message;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      $('toast').hidden = true;
    }, 2800);
  }
  function go(id) {
    if (!index[id]) {
      toast('Esta interação depende de definição do produto.');
      return;
    }
    if (['IDE-01', 'IDE-02', 'IDE-08'].includes(id) && !current.startsWith('IDE-') && !index[current].requiresAuth) {
      if (['ENT-01', 'ENT-05'].includes(current)) identityReturn = 'DEP-01';
      else if (current === 'DES-10') identityReturn = 'ADE-01';
    }
    if (id === 'IDE-05' || id === 'IDE-06' || id === 'IDE-07') {
      if (index[current]?.requiresAuth) identityReturn = current;
      authenticatedUntil = 0;
      clearTimeout(sessionTimer);
      $('gallery').innerHTML = '';
      $('document-dialog').close();
    }
    if ((index[id].requiresAuth || id === 'IDE-03') && !isAuthenticated()) {
      if (id !== 'IDE-03') identityReturn = id;
      id = 'IDE-01';
    }
    if (id === 'IDE-03')
      index['IDE-03'].actions[0] = { label: 'Continuar pedido', target: identityReturn };
    if (['ADE-01', 'ADE-02'].includes(id) && isAuthenticated()) id = 'ADE-03';
    if (id === 'ADE-04' && selectedPlan === 'Individual') id = 'ADE-05';
    current = id;
    if (index[id].seed) Object.assign(memory, index[id].seed);
    additions = [];
    if (location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
    render();
  }
  function renderNav() {
    const active = index[current].journey;
    let previousStage = '';
    let html = '';
    for (const group of groups) {
      const matches =
        !query ||
        `${group.title} ${group.code} ${group.description}`.toLowerCase().includes(query) ||
        group.steps.some((step) =>
          `${step.id} ${step.title} ${step.bot}`.toLowerCase().includes(query),
        );
      if (!matches) continue;
      if (group.stage !== previousStage) {
        html += `<div class="nav-section">${escape(group.stage)}</div>`;
        previousStage = group.stage;
      }
      html += `<button class="journey-link ${active === group.code ? 'active' : ''}" data-go="${group.steps[0].id}" ${active === group.code ? 'aria-current="page"' : ''}><span class="nav-code">${group.code}</span><span>${escape(group.title)}</span><span class="count">${group.steps.length}</span></button>`;
    }
    $('journeys').innerHTML = html || '<p class="empty-search">Nenhum estado encontrado.</p>';
    $('catalog-count').textContent = `${groups.length} jornadas · ${total} estados`;
  }
  function renderStates(group) {
    const steps = group.steps.filter(
      (step) =>
        (stateFilter === 'all' || step.alternative === (stateFilter === 'alternative')) &&
        (!query ||
          `${step.id} ${step.title} ${step.bot} ${group.title}`.toLowerCase().includes(query)),
    );
    $('states').innerHTML =
      `<div class="state-list">${steps.map((step) => `<button class="state-button ${step.id === current ? 'active' : ''}" data-go="${step.id}" ${step.id === current ? 'aria-current="step"' : ''}><span class="state-number">${step.position + 1}</span><span class="state-label">${escape(step.title)}<small>${step.alternative ? '<span class="variant-dot"></span>' : ''}${step.id} · ${modeLabels[step.mode].split(' · ')[0]}</small></span></button>`).join('') || '<p class="no-results">Nenhum estado corresponde ao filtro.</p>'}</div>`;
    const active = $('states').querySelector('.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
    $('state-count').textContent = `${group.steps.length} estados`;
  }
  function actionsMarkup(actions, mini = false) {
    return actions.length
      ? `<div class="bubble-actions">${actions.map((item) => `<button class="wa-action" ${mini ? 'disabled' : `data-go="${item.target}"`}>${escape(item.label)}</button>`).join('')}</div>`
      : '';
  }
  function bubble(text, user = false, extra = '') {
    return `<div class="bubble ${user ? 'user' : ''}"><p>${format(text)}</p>${extra}<div class="timestamp">9:41${user ? '<span class="ticks">✓✓</span>' : ''}</div></div>`;
  }
  function audioMarkup() {
    return `<div class="audio-bubble"><button type="button" data-audio aria-label="Reproduzir áudio">▶</button><div class="wave" aria-hidden="true">${[8, 13, 20, 10, 24, 17, 9, 15, 21, 12, 8, 20, 17, 9, 23, 14, 9, 17, 22, 12].map((height) => `<i style="height:${height}px"></i>`).join('')}</div><span class="audio-label">0:18</span></div>`;
  }
  function documentMarkup(names, mini = false) {
    return names
      .map(
        (name) =>
          `<div class="document-card"><span class="doc-icon">PDF</span><div><strong>${escape(name)}.pdf</strong><small>Documento do plano · PDF</small></div></div>${mini ? '' : `<button class="wa-action" data-document="${escape(name)}">Abrir documento</button>`}`,
      )
      .join('');
  }
  function screenBot(step) {
    if (step.journey === 'SOL' && selectedContract !== 'Serviços de Assistência') {
      if (step.id === 'SOL-02')
        return `Estas são as solicitações do contrato selecionado: ${selectedContract}.`;
    }
    if (step.id === 'DES-08' && selectedPlan === 'Individual')
      return '**Serviços de Assistência Individual**\nValor total: R$ 29,90/mês.\nComposição: somente titular.\nVocê poderá revisar carências, limites e pagamento antes de contratar.';
    return step.bot;
  }
  function renderChat(step) {
    let html =
      '<div class="chat-day">Hoje</div>';
    if (step.user)
      html += step.mode === 'audio' ? bubble('', true, audioMarkup()) : bubble(step.user, true);
    let extras = step.mode === 'document' ? documentMarkup(step.documents) : '';
    extras += actionsMarkup(step.actions);
    if (step.flow)
      extras += `<div class="bubble-actions"><button class="wa-action" data-open-flow>${step.mode === 'list' ? 'Selecionar uma opção' : step.mode === 'review' ? 'Abrir revisão' : 'Abrir formulário'}</button></div>`;
    html += bubble(screenBot(step), false, extras);
    for (const item of additions) html += bubble(item.text, item.user);
    $('chat').innerHTML = html;
    $('chat').scrollTop = $('chat').scrollHeight;
  }
  function rowsMarkup(sections) {
    return sections
      .map(
        (section) =>
          `<section class="review-section"><h4>${escape(section.title)}</h4>${section.rows.map(([label, value]) => `<div class="review-line"><span>${escape(label)}</span><strong>${format(value)}</strong></div>`).join('')}</section>`,
      )
      .join('');
  }
  function fieldsMarkup(fields) {
    return fields
      .map((field) => {
        const value = memory[field.name] ?? field.value ?? '';
        const attrs = `${field.required ? 'required' : ''} ${field.pattern ? `pattern="${field.pattern}"` : ''}`;
        if (field.type === 'checkbox')
          return `<label class="consent"><input type="checkbox" name="${field.name}" ${(memory[field.name] ?? field.checked) ? 'checked' : ''} /><span>${escape(field.label)}</span></label>`;
        if (field.type === 'select')
          return `<label>${escape(field.label)}<select name="${field.name}" ${attrs}>${field.choices.map((choice, i) => `<option value="${i === 0 ? '' : escape(choice)}" ${value === choice ? 'selected' : ''}>${escape(choice)}</option>`).join('')}</select></label>`;
        if (field.type === 'textarea')
          return `<label>${escape(field.label)}<textarea name="${field.name}" ${attrs}>${escape(value)}</textarea></label>`;
        const inputValue =
          field.type === 'date' && /^\d{2}\/\d{2}\/\d{4}$/.test(String(value))
            ? String(value).split('/').reverse().join('-')
            : value;
        return `<label>${escape(field.label)}<input name="${field.name}" type="${field.type || 'text'}" ${field.type === 'file' ? 'accept=".pdf,.jpg,.jpeg,.png"' : `value="${escape(inputValue)}"`} placeholder="${escape(field.placeholder || '')}" ${attrs} /></label>`;
      })
      .join('');
  }
  function listChoices(step) {
    return step.flow.choices;
  }
  function renderFlow(step) {
    if (step.requiresAuth && !isAuthenticated()) {
      go(step.id);
      return;
    }
    const flow = step.flow;
    if (!flow) {
      $('overlay').hidden = true;
      return;
    }
    if (flow.contracting) {
      renderContractingFlow(step);
      return;
    }
    if (flow.discovery) {
      Object.assign(discoveryState, { page: 0, service: null, modality: null, intent: null });
      renderDiscoveryFlow(step);
      return;
    }
    let content = '';
    if (step.mode === 'form') content = fieldsMarkup(flow.fields);
    if (step.mode === 'list')
      content = listChoices(step)
        .map(
          (choice, i) =>
            `<label class="flow-option"><input type="radio" name="choice" value="${i}" required ${choice.disabled ? 'disabled' : ''} /><span><strong>${escape(choice.label)}</strong>${choice.detail ? `<small>${escape(choice.detail)}</small>` : ''}</span></label>`,
        )
        .join('');
    if (step.mode === 'review') content = rowsMarkup(flow.sections);
    if (flow.documents)
      content += flow.documents
        .map(
          (name) =>
            `<button type="button" class="flow-document" data-document="${escape(name)}">▤ ${escape(name)}</button>`,
        )
        .join('');
    if (flow.consent)
      content += `<label class="consent"><input type="checkbox" name="consent" required /><span>${escape(flow.consent)}</span></label>`;
    if (flow.note) content += `<div class="flow-alert">${escape(flow.note)}</div>`;
    content += '<p id="flow-error" class="flow-error" role="alert" hidden></p>';
    $('overlay').innerHTML =
      `<form id="flow-form" class="sheet" aria-label="${escape(flow.title)}"><div class="sheet-handle"></div><header class="sheet-header"><div><h3>${escape(flow.title)}</h3><p>${step.mode === 'list' ? 'Selecione uma opção para continuar' : step.mode === 'review' ? 'Confira as informações antes de confirmar' : 'Preencha os dados solicitados'}</p></div><button type="button" class="sheet-close" data-close-flow aria-label="Fechar formulário">✕</button></header><div class="sheet-content">${content}</div><footer class="sheet-footer"><button type="submit" class="sheet-primary">${escape(flow.submit)}</button>${flow.correction ? `<button type="button" class="sheet-secondary" data-go="${flow.correction}">${escape(flow.secondaryLabel || 'Corrigir pela conversa')}</button>` : ''}<p class="flow-note">DIGIO Care</p></footer></form>`;
    $('overlay').hidden = false;
    $('flow-form').addEventListener('input', (event) => {
      if (step.mode !== 'form') return;
      const field = flow.fields.find((item) => item.name === event.target.name);
      if (!field || field.type === 'file') return;
      memory[field.name] = field.type === 'checkbox' ? event.target.checked : event.target.value;
    });
    $('flow-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      let target = flow.target;
      if (step.mode === 'list') {
        const choice = listChoices(step)[Number(data.get('choice'))];
        if (!choice || choice.disabled) return;
        target = choice.target;
        if (step.id === 'CAN-13') memory.cancelReason = choice.label;
        if (step.id === 'CON-01' || step.id === 'SOL-01') selectedContract = choice.label;
        if (step.id === 'DES-05') selectedPlan = choice.label;
      }
      if (step.mode === 'form') {
        for (const field of flow.fields) {
          const raw = data.get(field.name);
          if (field.type === 'file') {
            if (raw && raw.size > 10 * 1024 * 1024) {
              $('flow-error').textContent = 'Use um arquivo de até 10 MB.';
              $('flow-error').hidden = false;
              return;
            }
            if (raw && raw.size && !/\.(pdf|jpe?g|png)$/i.test(raw.name)) {
              $('flow-error').textContent = 'Use um PDF ou imagem JPG/PNG.';
              $('flow-error').hidden = false;
              return;
            }
            memory[field.name] = raw?.name || '';
          } else if (field.type === 'checkbox') memory[field.name] = data.has(field.name);
          else if (field.type === 'date')
            memory[field.name] = String(raw).split('-').reverse().join('/');
          else memory[field.name] = String(raw ?? '').trim();
        }
      }
      if (target) go(target);
    });
  }
  function renderContractingFlow(step, reviewing = false) {
    const flow = step.flow;
    const source = flow.contracting;
    const title = reviewing ? 'Revisar contratação' : flow.title;
    const selectedService = index['DES-01'].flow.discovery.services.find((item) => item.id === discoveryState.service);
    const individual = selectedPlan === 'Individual';
    let content = fieldsMarkup(flow.fields);
    if (reviewing) {
      content = rowsMarkup([
        { title: `${selectedService?.title || 'Serviços de Assistência'} ${selectedPlan}`, rows: [
          ['Total mensal', individual ? 'R$ 29,90/mês' : source.price],
          ...flow.fields.map((field) => [field.label, memory[field.name] || '']),
        ] },
      ]);
      content += `<p>${escape(individual ? 'Este plano atende somente o titular.' : source.participants)}</p><p>${escape(source.conditions)}</p>`;
      content += source.documents.map((name) => `<button type="button" class="flow-document" data-document="${escape(name)}">▤ ${escape(name)}</button>`).join('');
      content += `<label class="consent"><input type="checkbox" name="consent" required /><span>${escape(source.consent)}</span></label>`;
    }
    $('overlay').innerHTML = `<form id="flow-form" class="sheet" aria-label="${escape(title)}"><div class="sheet-handle"></div><header class="sheet-header"><div><h3>${escape(title)}</h3><p>${reviewing ? 'Confira as informações antes de confirmar' : 'Preencha os dados e escolha o pagamento'}</p></div><button type="button" class="sheet-close" data-close-flow aria-label="Fechar formulário">✕</button></header><div class="sheet-content">${content}</div><footer class="sheet-footer">${reviewing ? '<button type="button" class="sheet-secondary" data-contract-back>Voltar</button>' : ''}<button type="submit" class="sheet-primary">${reviewing ? 'Confirmar contratação' : flow.submit}</button><p class="flow-note">DIGIO Care</p></footer></form>`;
    $('overlay').hidden = false;
    $('flow-form').addEventListener('input', (event) => {
      if (reviewing) return;
      if (flow.fields.some((field) => field.name === event.target.name)) memory[event.target.name] = event.target.value;
    });
    $('flow-form').querySelector('[data-contract-back]')?.addEventListener('click', () => renderContractingFlow(step));
    $('flow-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      if (!reviewing) {
        for (const field of flow.fields) memory[field.name] = String(data.get(field.name) || '').trim();
        renderContractingFlow(step, true);
      } else if (data.has('consent')) {
        go(flow.target);
      }
    });
  }
  function renderDiscoveryFlow(step) {
    const d = step.flow.discovery;
    const { page, service, modality } = discoveryState;
    const rich = (value) => escape(value).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    const paragraph = (value) => `<p>${rich(value)}</p>`;
    const options = (name, items, selected) => items.map((item) =>
      `<label class="flow-option"><input type="radio" name="${name}" value="${escape(item.id)}" required ${selected === item.id ? 'checked' : ''} /><span><strong>${escape(item.title)}</strong>${item.description ? `<small>${escape(item.description)}</small>` : ''}</span></label>`,
    ).join('');
    const plan = d.plans.find((item) => item.id === modality);
    const summary = plan ? `<h4>${escape(plan.title)}</h4>${paragraph(plan.price)}${paragraph(plan.composition)}` : '';
    const titles = ['Conhecer produtos', 'Detalhes do serviço', 'Planos e comparação', 'Condições do plano', 'Concluir descoberta'];
    const buttons = ['Ver detalhes', 'Ver planos', 'Ver condições', 'Continuar', 'Concluir'];
    let content;
    if (page === 0) content = paragraph('Explore os três serviços, veja os detalhes e compare os planos sem sair deste Flow.') + options('service', d.services.map((item, i) => ({ ...item, description: step.flow.choices[i].detail })), service);
    if (page === 1) {
      const chosen = d.services.find((item) => item.id === service);
      content = `<h4>${escape(chosen.title)}</h4>${paragraph(chosen.description)}${paragraph('Use Voltar para conhecer outro serviço. Todas as etapas continuam neste mesmo Flow.')}`;
    }
    if (page === 2) content = '<h4>Comparação de planos</h4>' + paragraph(d.comparison) + options('modality', d.plans, modality);
    if (page === 3) content = summary + paragraph(d.conditions);
    if (page === 4) content = summary + paragraph('Você pode concluir a descoberta ou iniciar uma contratação. Iniciar não contrata nem cobra: primeiro será necessário informar o CPF e revisar os dados e condições.') + options('intent', d.outcomes.map((item) => ({ id: item.id, title: item.label })), discoveryState.intent);
    $('overlay').innerHTML = `<form id="flow-form" class="sheet" aria-label="${escape(titles[page])}"><div class="sheet-handle"></div><header class="sheet-header">${page ? '<button type="button" class="sheet-close" data-discovery-back aria-label="Voltar">←</button>' : ''}<div><h3>${escape(titles[page])}</h3><p>Explore sem sair deste Flow</p></div><button type="button" class="sheet-close" data-close-flow aria-label="Fechar formulário">✕</button></header><div class="sheet-content">${content}</div><footer class="sheet-footer"><button type="submit" class="sheet-primary">${buttons[page]}</button><p class="flow-note">DIGIO Care</p></footer></form>`;
    $('overlay').hidden = false;
    $('flow-form').querySelector('[data-discovery-back]')?.addEventListener('click', () => {
      discoveryState.page--;
      renderDiscoveryFlow(step);
    });
    const title = $('flow-form').querySelector('.sheet-header h3');
    title.setAttribute('tabindex', '-1');
    title.focus();
    $('flow-form').addEventListener('change', (event) => {
      if (['service', 'modality', 'intent'].includes(event.target.name))
        discoveryState[event.target.name] = event.target.value;
    });
    $('flow-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      if (page === 0) discoveryState.service = data.get('service');
      if (page === 2) discoveryState.modality = data.get('modality');
      if (page < 4) {
        discoveryState.page++;
        renderDiscoveryFlow(step);
        return;
      }
      const outcome = d.outcomes.find((item) => item.id === data.get('intent'));
      if (!outcome) return;
      selectedPlan = plan.title;
      go(outcome.target);
    });
  }
  function renderInspector(step, group) {
    $('screen-title').textContent = step.title;
    $('screen-status').innerHTML =
      `<span class="status-tag ${step.alternative ? 'alternative' : ''}">${step.alternative ? 'Variação / exceção' : ['CAD', 'PRE'].includes(group.code) ? 'Atendimento' : 'Percurso principal'}</span>`;
    $('screen-intent').textContent = interpolate(step.intent);
    $('screen-behavior').textContent = interpolate(step.behavior).replace(/\*\*/g, '');
    $('screen-component').textContent = modeLabels[step.mode];
    $('screen-rule').hidden = true;
    $('screen-rule').previousElementSibling.hidden = true;
    $('journey-decision').closest('.decision-box').hidden = true;
    const links = [
      ...step.actions,
      ...(step.flow?.target ? [{ label: step.flow.submit, target: step.flow.target }] : []),
      ...(step.flow?.choices
        ? step.flow.choices
            .filter((c) => c.target)
            .map((c) => ({ label: c.label, target: c.target }))
        : []),
    ];
    $('transitions').innerHTML = links.length
      ? `<h4>Destinos da interação</h4>${links.map((link) => `<button data-go="${link.target}">${escape(link.label)} · ${link.target}</button>`).join('')}`
      : '';
  }
  function render() {
    const scroll = window.scrollY;
    const step = index[current];
    const group = groupFor(step);
    $('breadcrumb-title').textContent = group.title;
    $('journey-code').textContent = group.code;
    $('journey-stage').textContent = group.stage;
    $('journey-title').textContent = group.title;
    $('journey-description').textContent = group.description;
    $('screen-id').textContent = step.id;
    $('screen-type').textContent = modeLabels[step.mode];
    $('position').textContent = `${step.position + 1} / ${group.steps.length}`;
    $('previous').disabled = step.position === 0;
    $('phone-back').disabled = step.position === 0;
    $('next').disabled = step.position === group.steps.length - 1;
    $('next').textContent =
      step.position === group.steps.length - 1 ? 'Fim da jornada' : 'Próxima tela →';
    $('phone').classList.toggle('light-wa', light);
    renderNav();
    renderStates(group);
    renderChat(step);
    renderFlow(step);
    renderInspector(step, group);
    $('lifecycle').innerHTML = ['DES', 'ADE', 'CON', 'UTI', 'DEP', 'COB', 'FUN', 'REN', 'CAN']
      .map(
        (code) =>
          `<button class="${code === group.code ? 'active' : ''}" data-go="${groups.find((g) => g.code === code).steps[0].id}">${escape(groups.find((g) => g.code === code).title)}</button>`,
      )
      .join('');
    window.scrollTo({ top: scroll });
  }
  function galleryFlow(step) {
    if (!step.flow) return '';
    let content = '';
    if (step.flow.sections) content = rowsMarkup(step.flow.sections);
    if (step.flow.fields)
      content = step.flow.fields
        .map(
          (field) =>
            `<div class="mini-field">${escape(field.label)}<br><strong>${escape(field.type === 'file' ? 'Selecionar arquivo' : interpolate(memory[field.name] ?? field.value ?? field.placeholder ?? 'Preencher'))}</strong></div>`,
        )
        .join('');
    if (step.flow.choices)
      content = step.flow.choices
        .map(
          (choice) =>
            `<div class="mini-field">○ ${escape(choice.label)}${choice.detail ? `<br>${escape(choice.detail)}` : ''}</div>`,
        )
        .join('');
    if (step.flow.documents)
      content += step.flow.documents
        .map((name) => `<div class="mini-field">▤ ${escape(name)}</div>`)
        .join('');
    if (step.flow.consent)
      content += `<div class="mini-field">□ ${escape(step.flow.consent)}</div>`;
    return `<div class="mini-sheet"><h5>${escape(step.flow.title)}</h5>${content}<button class="sheet-primary" disabled>${escape(step.flow.submit)}</button></div>`;
  }
  function renderGallery() {
    if (!isAuthenticated()) {
      $('gallery').innerHTML = '<p>Autentique seu acesso para visualizar as jornadas pessoais do catálogo.</p>';
      return;
    }
    $('gallery').innerHTML = groups
      .map(
        (group) =>
          `<header class="gallery-heading"><div><h3>${group.code} · ${escape(group.title)}</h3><p>${group.steps.length} etapas de atendimento</p></div></header><div class="gallery-grid">${group.steps.map((step) => `<article class="gallery-card"><header><span>${step.id}</span><span>${step.alternative ? 'Variação' : modeLabels[step.mode].split(' · ')[0]}</span></header><h4>${escape(step.title)}</h4><div class="mini-phone ${light ? 'light-wa' : ''}"><div class="mini-header"><span class="wa-avatar">d</span><span>DIGIO Care ✓</span></div><div class="mini-chat">${step.user ? bubble(step.user, true, '', true) : ''}${bubble(step.bot, false, step.documents ? documentMarkup(step.documents, true) : actionsMarkup(step.actions, true), true)}</div>${galleryFlow(step)}</div><button class="gallery-open" data-gallery-go="${step.id}">Abrir interação · ${step.id}</button></article>`).join('')}</div>`,
      )
      .join('');
  }
  function toggleGallery(force) {
    if (force !== false && !isAuthenticated()) {
      go('IDE-01');
      return;
    }
    galleryVisible = force ?? !galleryVisible;
    $('gallery').hidden = !galleryVisible;
    $('explorer').hidden = galleryVisible;
    $('gallery-toggle').setAttribute('aria-pressed', String(galleryVisible));
    $('gallery-toggle').textContent = galleryVisible ? 'Voltar à interação' : 'Todas as telas';
    if (galleryVisible) renderGallery();
  }
  function showDocument(title) {
    if (!isAuthenticated()) {
      identityReturn = current;
      go('IDE-01');
      return;
    }
    $('document-title').textContent = title;
    $('document-content').innerHTML =
      `<div class="document-content"><p><strong>DIGIO Care · ${escape(title)}</strong></p><p>Produto: Serviços de Assistência.<br>Contrato: final 2048.<br>Participante: Ana Silva.<br>Data: 10/10/2026.</p></div>`;
    $('document-dialog').showModal();
  }
  document.addEventListener('click', (event) => {
    const destination = event.target.closest('[data-go]');
    if (destination) {
      go(destination.dataset.go);
      return;
    }
    const galleryDestination = event.target.closest('[data-gallery-go]');
    if (galleryDestination) {
      toggleGallery(false);
      go(galleryDestination.dataset.galleryGo);
      window.scrollTo({ top: 0, behavior: 'instant' });
      return;
    }
    if (event.target.closest('[data-open-flow]')) renderFlow(index[current]);
    if (event.target.closest('[data-close-flow]')) {
      $('overlay').hidden = true;
      toast('Formulário fechado. Os dados já enviados estão preservados.');
    }
    const documentButton = event.target.closest('[data-document]');
    if (documentButton) showDocument(documentButton.dataset.document);
    if (event.target.closest('[data-audio]'))
      toast('Transcrição: quero incluir minha filha na assistência.');
  });
  const move = (delta) => {
    const step = index[current];
    const next = groupFor(step).steps[step.position + delta];
    if (next) go(next.id);
  };
  $('previous').addEventListener('click', () => move(-1));
  $('phone-back').addEventListener('click', () => move(-1));
  $('next').addEventListener('click', () => move(1));
  $('phone-help').addEventListener('click', () => go('HUM-01'));
  $('theme').addEventListener('click', () => {
    light = !light;
    $('theme').textContent = light ? 'Tema escuro' : 'Tema claro';
    render();
    if (galleryVisible) renderGallery();
  });
  $('gallery-toggle').addEventListener('click', () => toggleGallery());
  $('search').addEventListener('input', (event) => {
    query = event.target.value.trim().toLowerCase();
    renderNav();
    renderStates(groupFor(index[current]));
  });
  document.querySelectorAll('[data-filter]').forEach((button) =>
    button.addEventListener('click', () => {
      stateFilter = button.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach((item) => {
        item.classList.toggle('selected', item === button);
        item.setAttribute('aria-pressed', String(item === button));
      });
      renderStates(groupFor(index[current]));
    }),
  );
  $('print').addEventListener('click', () => {
    renderGallery();
    window.print();
  });
  $('copy-link').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      toast('Link desta tela copiado.');
    } catch {
      toast(`Identificador desta tela: ${current}`);
    }
  });
  $('close-document').addEventListener('click', () => $('document-dialog').close());
  $('attach').addEventListener('click', () => {
    go('HUM-01');
    toast('Solicite orientação para enviar documentos. Nenhum arquivo será enviado.');
  });
  $('composer').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = $('message-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    const clean = text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    const step = index[current];
    if (/\b(menu|opcoes)\b/.test(clean)) {
      go('NAV-01');
      return;
    }
    if (/atendente|pessoa|humano/.test(clean)) {
      go('HUM-01');
      return;
    }
    if (['IDE-01', 'IDE-02', 'IDE-04', 'IDE-05', 'IDE-06', 'IDE-08'].includes(current)) {
      if (!validCpf(text)) {
        go('IDE-04');
        return;
      }
      // Format-only demonstration. Never retain or repeat the identity CPF.
      authenticatedUntil = Date.now() + 15 * 60 * 1000;
      clearTimeout(sessionTimer);
      sessionTimer = setTimeout(() => {
        toggleGallery(false);
        go('IDE-05');
      }, 15 * 60 * 1000);
      go(identityReturn);
      additions.unshift({ user: false, text: index['IDE-03'].bot });
      render();
      return;
    }
    if (/solicitac|protocolo|meus pedidos/.test(clean)) {
      go('SOL-01');
      return;
    }
    if (['DEP-14', 'DEP-19', 'DEP-27'].includes(current)) {
      const date = text.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
      if (date) {
        memory.birth = date[1];
        go(current === 'DEP-19' ? 'DEP-20' : 'DEP-16');
        return;
      }
      const name = text.match(/(?:nome (?:correto )?(?:e|é)|chama(?:-se)?)\s+(.+)/i);
      if (name) {
        memory.name = name[1];
        go(current === 'DEP-19' ? 'DEP-20' : 'DEP-16');
        return;
      }
      additions.push(
        { user: true, text },
        {
          user: false,
          text: 'Recebi a correção. Informe a data de nascimento ou o nome para atualizar os dados.',
        },
      );
    } else if (/cancel/.test(clean)) {
      go(clean.includes('oferta') ? 'CAN-04' : 'CAN-01');
      return;
    } else if (/exclu|remover/.test(clean)) {
      go('EXC-01');
      return;
    } else if (/incluir|adicionar/.test(clean)) {
      go('DEP-01');
      return;
    } else if (/pagar|pagamento|cobranca|mensalidade/.test(clean)) {
      go('COB-01');
      return;
    } else if (/sinistro|roub|furto/.test(clean)) {
      go('DES-03');
      return;
    } else if (/telemedicina|consulta para/.test(clean)) {
      go('UTI-02');
      return;
    } else if (/funeral/.test(clean)) {
      go('FUN-01');
      return;
    } else if (/trocar.*plano|mudar.*plano/.test(clean)) {
      go('PLA-01');
      return;
    } else if (/contratar/.test(clean)) {
      go('ADE-01');
      return;
    } else if (/document/.test(clean)) {
      go('CON-07');
      return;
    } else if (/voltar/.test(clean)) {
      move(-1);
      return;
    } else if (step.journey === 'DEP' && ['DEP-03', 'DEP-04'].includes(current)) {
      const date = text.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
      if (date) memory.birth = date[1];
      const name = text.match(/(?:nome (?:e|é)|chama(?:-se)?)\s+([^,.\n]+)/i);
      if (name) memory.name = name[1];
      additions.push(
        { user: true, text },
        {
          user: false,
          text: 'Dados recebidos. Você pode abrir a revisão para conferir, ou continuar preenchendo pelo formulário.',
        },
      );
    } else
      additions.push(
        { user: true, text },
        {
          user: false,
          text: 'Escolha uma opção ou escreva como podemos ajudar: incluir um dependente, ver documentos ou consultar pagamentos.',
        },
      );
    renderChat(step);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
      event.preventDefault();
      $('search').focus();
    }
    if (event.key === 'Escape' && !$('overlay').hidden) $('overlay').hidden = true;
  });
  window.addEventListener('hashchange', () => {
    if (index[location.hash.slice(1)]) go(location.hash.slice(1));
  });
  window.addEventListener('beforeprint', renderGallery);
  window.PROTOTYPE = { go, getCurrent: () => current, renderGallery, total, groups: groups.length };
  go(current);
})();
