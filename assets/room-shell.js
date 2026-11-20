/* Route the workspace and place the reader's controls in its command dock. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const app = $('#app');
  const lib = window.LireloLibrary;
  const reader = $('#readerScreen');
  const panel = $('#rrRightPanel');
  const contents = $('#roomReaderContents');
  const notebook = $('#roomReaderNotebook');

  $('.page-heading').append($('.sidebar .search'));
  $('.room-collections').append($('#collectionNav'));
  $('#roomNewCollection').addEventListener('click', () => $('#newCollection').click());
  $('#roomImport').addEventListener('click', () => $('#addBooks').click());

  const routeButtons = $$('.room-nav [data-room-route], .room-manage [data-room-route]');
  function updateNav(){
    const saved = app.classList.contains('phase4-open') || window.LireloPhase4.state.active;
    const managed = window.LireloFinal?.state?.active;
    const active = managed ? window.LireloFinal.state.view : saved ? 'notebook' : 'library';
    for(const button of routeButtons){
      const destination = button.dataset.roomRoute;
      if(destination === active || (managed && button.closest('.room-nav') && destination === 'account')){
        button.setAttribute('aria-current','page');
      }else button.removeAttribute('aria-current');
    }
  }

  app.addEventListener('click',event=>{
    const trigger = event.target.closest('[data-room-route]');
    if(!trigger)return;
    const route = trigger.dataset.roomRoute;
    if(route==='notebook'){
      if(window.LireloFinal.state.active)window.LireloFinal.leave();
      window.LireloPhase4.enter('all');
    }else{
      const button = $('#navMain [data-section="'+route+'"]');
      button?.click();
      if(route==='library'){
        $('#sidebarSearch').value='';
        lib.state.query='';
        lib.render();
      }
    }
    const readingButton = $('#roomReadingNow');
    const reading = lib.state.section==='reading';
    readingButton.dataset.roomRoute = reading ? 'library' : 'reading';
    readingButton.lastChild.textContent = reading ? ' All books' : ' Reading now';
    updateNav();
    window.scrollTo(0,0);
  });

  $('.room-paging').append($('#rrPrevious'),$('#rrPageTrigger'),$('#rrNext'));
  $('.room-zoom-body').append($('#rrZoomOut'),$('#rrZoomLabel'),$('#rrZoomIn'));
  $('.room-bookmark').append($('#rrBookmark'));
  const tools = $('.room-reader-tools');
  const toolActions = [
    ['rrSearchToggle','Find in book'], ['rrHighlightTool','Highlight selected text'],
    ['rrAddNote','Add a note'], ['rrOfflineSave','Save for offline'],
    ['rrSettingsToggle','Display preferences'], ['rrMode','Page layout'], ['rrFullscreen','Focus mode'],
  ];
  for(const [id,label] of toolActions){
    const button = document.getElementById(id);
    const title = button.querySelector('#rrModeText');
    if(!title){
      const text = document.createElement('span');
      text.textContent=label;
      button.append(text);
    }
    tools.append(button);
  }
  const zoom = $('#roomZoom');
  const more = $('#roomReaderMore');
  for(const menu of [zoom,more]){
    menu.addEventListener('toggle',()=>{if(menu.open)(menu===zoom?more:zoom).open=false});
  }
  $('#lrReaderMore').addEventListener('click',()=>{more.open=false});
  tools.addEventListener('click',event=>{
    if(event.target.closest('button')){
      more.open=false;
      if(event.target.closest('#rrSettingsToggle,#rrSearchToggle')===null)more.querySelector('summary').focus();
    }
  });
  document.addEventListener('pointerdown',event=>{
    for(const menu of [zoom,more])if(menu.open&&!menu.contains(event.target))menu.open=false;
  });

  let panelTrigger;
  function closePanel(restoreFocus = false){
    reader.classList.remove('panel-open');
    if(restoreFocus)panelTrigger?.focus();
  }
  function openPanel(trigger,tab){
    if(!window.LireloReader.state.doc)return;
    if(reader.classList.contains('panel-open')&&panelTrigger===trigger){closePanel(true);return}
    panelTrigger=trigger;
    panel.classList.remove('hidden');
    panel.querySelector('[data-rr-tab="'+tab+'"]').click();
    reader.classList.add('panel-open');
    contents.setAttribute('aria-expanded',String(trigger===contents));
    notebook.setAttribute('aria-expanded',String(trigger===notebook));
    $('#rrSheetClose').focus();
  }
  contents.addEventListener('click',()=>openPanel(contents,'contents'));
  notebook.addEventListener('click',()=>openPanel(notebook,'highlights'));
  $('#roomReaderScrim').addEventListener('click',()=>closePanel(true));
  $('#rrSheetClose').addEventListener('click',()=>closePanel(true));
  const rrBack = $('#rrBack');
  rrBack.setAttribute('aria-label','Back to library');
  rrBack.append(Object.assign(document.createElement('span'),{textContent:'Library'}));
  rrBack.addEventListener('click',event=>{
    event.stopImmediatePropagation();
    window.LireloReader.close({showDetails:false});
    history.replaceState(null,'',location.pathname+location.search);
    $('.room-nav [data-room-route="library"]').click();
  },true);
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&reader.classList.contains('panel-open')&&!$('#rrNoteDialog').open) panelTrigger?.focus();
  },true);

  new MutationObserver(()=>{
    if(reader.classList.contains('panel-open'))return;
    contents.setAttribute('aria-expanded','false');
    notebook.setAttribute('aria-expanded','false');
  }).observe(reader,{attributes:true,attributeFilter:['class']});
  new MutationObserver(()=>{
    $('#roomZoomValue').textContent=$('#rrZoomLabel').textContent;
  }).observe($('#rrZoomLabel'),{childList:true,characterData:true,subtree:true});
  new MutationObserver(updateNav).observe(app,{attributes:true,attributeFilter:['class']});
  updateNav();
})();
