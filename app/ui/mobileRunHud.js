import { SCENE_KEYS } from '../config/sceneKeys';
import { theme } from '../config/gameConfig';

// A readable portrait view of the same scene state and commands. No duplicate game model.
export default function createMobileRunHud(scene) {
  const root=document.createElement('section');root.className='sky-mobile-run';root.setAttribute('aria-label','Run controls');
  root.style.setProperty('--menu-ink',theme.colors.semantic.text.status);root.style.setProperty('--menu-muted',theme.colors.semantic.text.muted);root.style.setProperty('--menu-accent',theme.colors.semantic.text.score);root.style.setProperty('--menu-panel',theme.colors.semantic.background.panel);
  root.innerHTML='<div class="sky-mobile-score"><strong></strong><button class="sky-mobile-pause">Pause</button></div><p class="sky-mobile-shields"></p><p class="sky-mobile-status"></p><p class="sky-mobile-objectives"></p><div class="sky-mobile-modal" hidden><h2></h2><p></p><div class="sky-mobile-actions"></div></div>';
  document.getElementById('phaser-example').appendChild(root);
  const pause=root.querySelector('.sky-mobile-pause'),modal=root.querySelector('.sky-mobile-modal'),actions=root.querySelector('.sky-mobile-actions');
  pause.addEventListener('click',()=>{if(scene.paused)scene.resume();else if(!scene.gameOverState&&!scene.activeChallenge&&!scene.pendingPerkChoices&&scene._getReadyRemainingMs<=0)scene.pause();});
  const text=(selector,value)=>{const target=root.querySelector(selector);if(target.textContent!==value)target.textContent=value;};
  let lastMode='';
  const addButton=(label,action)=>{const button=document.createElement('button');button.textContent=label;button.addEventListener('click',action);actions.appendChild(button);return button;};
  const viewport=window.matchMedia('(max-width: 620px)');
  const refresh=()=>{
    root.hidden=!viewport.matches;if(root.hidden)return;
    text('.sky-mobile-score strong',scene.scoreText?.text||'Get ready');
    text('.sky-mobile-shields',(scene.shieldText?.text||'')+' · '+(scene.phaseText?.text||'').replace('Heat / phase: ',''));
    text('.sky-mobile-status',scene.exitText?.text||scene.statusText?.text||'');
    text('.sky-mobile-objectives',scene.objectiveText?.text||'');
    const mode=scene.paused?'paused':scene.gameOverState==='ended'?'over':scene.activeChallenge||scene.pendingPerkChoices?'choice':'run';
    pause.hidden=mode==='over'||mode==='choice';pause.textContent=scene.paused?'Resume':'Pause';pause.disabled=scene._getReadyRemainingMs>0;
    modal.hidden=mode==='run';
    if(mode!==lastMode){
      actions.innerHTML='';lastMode=mode;
      if(mode==='paused'){
        addButton('Resume run',()=>scene.resume());
        addButton('Options',()=>scene.scene.start(SCENE_KEYS.options,{returnTo:SCENE_KEYS.game,returnData:{paused:true}}));
        addButton('Exit and save',()=>scene.exitAndSaveRun());
        addButton('Quit without saving',()=>scene.scene.start(SCENE_KEYS.mainMenu));
      } else if(mode==='over') {addButton('Play again',()=>scene.resetRun());addButton('Main menu',()=>scene.scene.start(SCENE_KEYS.mainMenu));}
      else if(mode==='choice'){[0,1,2].forEach(index=>addButton('',()=>scene._onChallengeOrPerkOptionSelected(index)));}
    }
    if(mode==='paused'){text('.sky-mobile-modal h2','Paused');text('.sky-mobile-modal > p','Take your time. Your run is frozen.');}
    if(mode==='over'){text('.sky-mobile-modal h2','Run complete');text('.sky-mobile-modal > p',scene.gameOverText?.text||'');}
    if(mode==='choice'){
      text('.sky-mobile-modal h2',scene.challengeText?.text||'Choose a perk');text('.sky-mobile-modal > p',scene.challengeTimerText?.text||'');
      Array.from(actions.children).forEach((button,index)=>{const option=scene.challengeOptionTexts?.[index];button.textContent=option?.text||'';button.hidden=!option?.visible||!option?.text;});
    }
  };
  scene.events.on('postupdate',refresh);
  scene.events.once('shutdown',()=>{scene.events.off('postupdate',refresh);root.remove();});
  return root;
}
