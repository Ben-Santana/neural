import {chromium} from 'playwright-core';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {Hand} from 'lucide-react';
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const hand=renderToStaticMarkup(createElement(Hand,{size:24,strokeWidth:1.5}));
writeFileSync('public/hand.svg',hand);
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1024,height:1024},deviceScaleFactor:1});
 await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;background:transparent}.tile{position:absolute;inset:64px;background:#f6f6f3;border-radius:200px;display:grid;place-items:center;color:#20221f}.tile svg{width:590px;height:590px}</style><div class="tile">${hand}</div>`);
 await page.screenshot({path:'build/icon.png',omitBackground:true});
} finally {await browser.close();}
mkdirSync('build/icon.iconset',{recursive:true});
for(const size of [16,32,128,256,512])for(const scale of [1,2])execFileSync('sips',['-z',String(size*scale),String(size*scale),'build/icon.png','--out',`build/icon.iconset/icon_${size}x${size}${scale===2?'@2x':''}.png`],{stdio:'ignore'});
execFileSync('iconutil',['-c','icns','build/icon.iconset','-o','build/icon.icns']);
