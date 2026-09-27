import { getModeList } from '../game/modeConfig';
import { ARCHETYPE_LIBRARY } from '../game/archetypeSystem';
import { getHighScore, getBestSurvivalSeconds, setSelectedArchetype } from '../save/saveManager';
import { SCENE_KEYS } from '../config/sceneKeys';
import { theme } from '../config/gameConfig';
import './mainMenuView.css';

export default function createMainMenuView(scene, {contracts, meta, daily, achievements}) {
  const element=document.createElement('section');element.className='sky-menu';element.setAttribute('aria-label','Skyfall main menu');
  element.style.setProperty('--menu-ink',theme.colors.semantic.text.status);
  element.style.setProperty('--menu-muted',theme.colors.semantic.text.muted);
  element.style.setProperty('--menu-accent',theme.colors.semantic.text.score);
  element.style.setProperty('--menu-panel',theme.colors.semantic.background.panel);
  element.innerHTML=`<div class="sky-menu-main"><p class="sky-kicker">ENDLESS DODGER</p><h2>SKYFALL</h2><p class="sky-intro">Survive the drop. Reach the exit.</p><fieldset class="sky-modes"><legend>CHOOSE YOUR RUN</legend></fieldset><div class="sky-launch"><button class="sky-play">Play <span>↗</span></button><span class="sky-shortcut">Enter / Space to start<br>Arrow keys to move</span></div><nav class="sky-destinations" aria-label="Game menu"></nav><p class="sky-daily"></p></div><aside class="sky-menu-aside"><div class="sky-record"><span class="sky-kicker">YOUR PERSONAL BEST</span><strong></strong><small></small></div><button class="sky-loadout"><span class="sky-kicker">LOADOUT · TAP TO CHANGE</span><strong></strong><small></small></button><section class="sky-contracts"><h3>TODAY’S CONTRACTS</h3><ul></ul></section><button class="sky-progress"><span></span><small>Spend rewards in Progression ↗</small></button><p class="sky-device-note"></p></aside>`;
  document.getElementById('phaser-example').appendChild(element);
  element.addEventListener('keydown',event=>{ if((event.key==='Enter'||event.key===' ')&&event.target.tagName==='BUTTON'){event.preventDefault();event.stopPropagation();event.target.click();} });
  const modes=element.querySelector('.sky-modes');
  const refresh=()=>{
    element.querySelector('.sky-record strong').textContent=String(getHighScore(scene.selectedMode));
    element.querySelector('.sky-record small').textContent=scene.selectedMode.replace('BossRush','Boss Rush')+' · '+getBestSurvivalSeconds(scene.selectedMode)+'s best survival';
    const archetype=ARCHETYPE_LIBRARY.find(item=>item.id===scene.selectedArchetypeId)||ARCHETYPE_LIBRARY[0];
    element.querySelector('.sky-loadout strong').textContent=archetype.name+' →';element.querySelector('.sky-loadout small').textContent=archetype.description;
    modes.querySelectorAll('button').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.mode===scene.selectedMode));});
  };
  const descriptions={Classic:'Find your rhythm. Survive waves, challenges and bosses.',BossRush:'Take on bosses sooner, with fewer filler hazards.',Draft:'Choose a new perk every 20 seconds. Build your run.'};
  getModeList().forEach((mode,index)=>{const button=document.createElement('button');button.type='button';button.dataset.mode=mode.mode;button.innerHTML='<span class="sky-mode-number"></span><strong></strong><small></small>';button.querySelector('span').textContent='0'+(index+1);button.querySelector('strong').textContent=mode.label;button.querySelector('small').textContent=descriptions[mode.mode];button.addEventListener('click',()=>{scene.selectedMode=mode.mode;refresh();});modes.appendChild(button);});
  element.querySelector('.sky-play').addEventListener('click',()=>scene._startSelectedRun());
  const destinations=[['Options',()=>scene.scene.start(SCENE_KEYS.options,{returnTo:SCENE_KEYS.mainMenu})],['Progression',()=>scene.scene.start(SCENE_KEYS.meta)],['Achievements',()=>scene.scene.start(SCENE_KEYS.achievements,{returnTo:SCENE_KEYS.mainMenu})],['How to play',()=>scene._acceptTutorialPrompt()],['Credits',()=>scene.scene.start(SCENE_KEYS.credits)]];
  if(typeof window.electronQuit==='function')destinations.push(['Quit',()=>scene.quit()]);
  destinations.forEach(([label,action])=>{const button=document.createElement('button');button.textContent=label;button.addEventListener('click',action);element.querySelector('.sky-destinations').appendChild(button);});
  element.querySelector('.sky-loadout').addEventListener('click',()=>{const index=ARCHETYPE_LIBRARY.findIndex(item=>item.id===scene.selectedArchetypeId);scene.selectedArchetypeId=ARCHETYPE_LIBRARY[(index+1)%ARCHETYPE_LIBRARY.length].id;setSelectedArchetype(scene.selectedArchetypeId);refresh();});
  element.querySelector('.sky-daily').textContent=daily;
  contracts.forEach(contract=>{const li=document.createElement('li');const title=document.createElement('span');title.textContent=contract.title;const count=document.createElement('strong');count.textContent=(contract.completed||contract.claimed)?'✓':contract.metric==='survivalMs'?Math.floor(contract.progress/1000)+' / '+Math.floor(contract.target/1000)+'s':contract.progress+' / '+contract.target;li.append(title,count);element.querySelector('.sky-contracts ul').appendChild(li);});
  element.querySelector('.sky-progress span').textContent=meta.currency+' coins · '+meta.unlockFragments+(meta.unlockFragments===1?' fragment':' fragments');element.querySelector('.sky-progress').addEventListener('click',()=>scene.scene.start(SCENE_KEYS.meta));
  element.querySelector('.sky-device-note').textContent=achievements+(achievements===1?' achievement unlocked':' achievements unlocked')+' · Progress saved on this device';
  refresh();
  scene.events.once('shutdown',()=>element.remove());
  return {element};
}
