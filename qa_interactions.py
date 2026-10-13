"""Check Reader annotations, saved notes, navigation, and tablet UI with Chromium DOM."""
import asyncio, json
from playwright.async_api import async_playwright
from qa_browser import open_ui

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  page,errors=await open_ui(browser,{'width':1440,'height':900})
  await page.locator('.book-card .book-open').first.click()
  bookid=await page.evaluate('window.LireloLibrary.state.books[0].id')
  await page.locator('[data-detail-tab="notes"]').click()
  await page.locator('#detailsNoteInput').fill('A note saved through Book Details.')
  await page.locator('#detailsNoteForm button[type=submit]').click()
  notes=await page.evaluate("id=>window.LireloApp.savedAnnotations(id).notes?.length||0",bookid)
  print('Notes in Book Details saved:',notes)
  assert notes==1
  await page.locator('#detailsRead').click()
  await page.wait_for_timeout(450)
  await page.locator('#rrBookmark').click()
  bookmarks=await page.evaluate('window.LireloReader.state.annotations.bookmarks.length')
  print('Reader bookmark count',bookmarks)
  assert bookmarks==1
  await page.locator('#rrAddNote').click()
  await page.locator('#rrNoteText').fill('A second note from Reader.')
  await page.locator('#rrNoteSave').click()
  total_notes=await page.evaluate('window.LireloReader.state.annotations.notes.length')
  print('Reader note count',total_notes)
  assert total_notes==2
  # Select a line of real PDF text and save a highlight through selection toolbar.
  await page.evaluate('''() => {const frag=document.querySelector('.rr-text-frag'); const rng=document.createRange();rng.selectNodeContents(frag);const s=window.getSelection();s.removeAllRanges();s.addRange(rng);document.querySelector('#rrCanvas').dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));}''')
  await page.wait_for_timeout(250)
  print('Selection toolbar visible',await page.locator('#rrSelectBar').is_visible())
  if await page.locator('#rrSelectBar').is_visible():
    await page.locator('#rrSelectionHighlight').click()
    count=await page.evaluate('window.LireloReader.state.annotations.highlights.length')
    print('Saved text highlights',count)
    assert count>=1
  # Page tone separate from workspace theme.
  await page.locator('#rrSettingsToggle').click()
  await page.locator('#rrPageTone').select_option('dark')
  print('Reader tone',await page.locator('#rrCanvas').get_attribute('data-tone'))
  assert await page.locator('#rrCanvas').get_attribute('data-tone')=='dark'
  await page.locator('#rrBack').click()
  await page.locator('[data-section="highlights"]').first.click()
  await page.wait_for_timeout(200)
  print('Phase 4 visible',not await page.locator('#phase4Screen').evaluate('(el)=>el.classList.contains("hidden")'))
  tablet,tablet_errors=await open_ui(browser,{'width':900,'height':1100})
  await tablet.locator('.book-card .book-open').first.click()
  await tablet.locator('#detailsRead').click()
  await tablet.wait_for_timeout(300)
  print('Tablet reader page',await tablet.locator('.rr-page-img').count())
  assert await tablet.locator('.rr-page-img').count()>0
  print('JS errors',json.dumps(errors+tablet_errors))
  assert not errors+tablet_errors
  await browser.close()

if __name__=='__main__':asyncio.run(main())
