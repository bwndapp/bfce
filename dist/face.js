var x={idle:{lidT:0,lidB:0,lidSkew:0,tilt:0,eyeScale:1,squashY:1,gap:1,eyeY:0,head:0,mouth:.1,open:0,track:1},happy:{lidT:0,lidB:.44,lidSkew:0,tilt:0,eyeScale:1.06,squashY:1,gap:1,eyeY:1,head:0,mouth:.85,open:0,track:.85},joy:{lidT:.16,lidB:.6,lidSkew:0,tilt:0,eyeScale:1.22,squashY:1,gap:1.05,eyeY:2,head:0,mouth:1,open:.35,track:.4},surprised:{lidT:0,lidB:0,lidSkew:0,tilt:0,eyeScale:1.3,squashY:1,gap:1.02,eyeY:-1,head:0,mouth:0,open:.95,track:1},curious:{lidT:0,lidB:0,lidSkew:.12,tilt:0,eyeScale:1.08,squashY:1,gap:1,eyeY:0,head:9,mouth:.35,open:.1,track:1},suspicious:{lidT:.3,lidB:.22,lidSkew:.24,tilt:6,eyeScale:1,squashY:1,gap:.96,eyeY:0,head:-5,mouth:-.25,open:0,track:1},focus:{lidT:.3,lidB:.26,lidSkew:0,tilt:3,eyeScale:1,squashY:1,gap:1,eyeY:0,head:0,mouth:0,open:0,track:1.2},sleepy:{lidT:.6,lidB:.05,lidSkew:0,tilt:-4,eyeScale:1,squashY:1,gap:1,eyeY:2,head:5,mouth:-.15,open:.15,track:.45},sad:{lidT:.34,lidB:0,lidSkew:0,tilt:-20,eyeScale:1.02,squashY:1,gap:1,eyeY:2,head:0,mouth:-.75,open:0,track:.7},angry:{lidT:.42,lidB:0,lidSkew:0,tilt:22,eyeScale:1,squashY:1,gap:.94,eyeY:0,head:0,mouth:-.55,open:0,track:1.15},sleep:{lidT:.5,lidB:.5,lidSkew:0,tilt:0,eyeScale:1,squashY:1,gap:1,eyeY:2,head:6,mouth:.1,open:.1,track:0}},Ae=Object.keys(x),W=Math.PI*2,Ce=e=>e<.5?2*e*e:1-2*(1-e)*(1-e),N={blink:{dur:.26,apply:(e,t)=>{t.blink=Math.max(t.blink,Math.sin(e*Math.PI)**.55)}},wink:{dur:.42,apply:(e,t)=>{t.winkR=Math.max(t.winkR,Math.sin(e*Math.PI)**.55)}},nod:{dur:.72,apply:(e,t)=>{t.hy+=Math.sin(e*W*1.5)*7*(1-e)}},shake:{dur:.72,apply:(e,t)=>{t.hx+=Math.sin(e*W*2)*7*(1-e)}},bounce:{dur:.85,apply:(e,t)=>{let i=Math.sin(e*W)*(1-e);t.hy-=Math.abs(i)*13,t.sy+=i*.13,t.sx-=i*.13}},pop:{dur:.5,apply:(e,t)=>{let i=Math.sin(e*Math.PI)*(1-e*.4);t.sx+=i*.17,t.sy+=i*.17}},boing:{dur:.95,apply:(e,t)=>{let i=Math.sin(e*W*2.2)*Math.exp(-e*4);t.sy+=i*.24,t.sx-=i*.24}},spin:{dur:.95,apply:(e,t)=>{t.rot+=Ce(e)*360}},jitter:{dur:.5,apply:(e,t)=>{let i=1-e;t.hx+=Math.sin(e*79)*2.2*i,t.hy+=Math.cos(e*67)*2.2*i}}},Ye=Object.keys(N);var me="http://www.w3.org/2000/svg",m=(e,t,i)=>e<t?t:e>i?i:e,E=(e,t)=>e+Math.random()*(t-e),o={headR:46,eyeX:19,eyeY:-3,eyeR:12,turn:.36,lean:1.8,clipPad:.6,lidSlack:1,pupilR:4.6,pupilTravel:4.2,mouthY:20,mouthW:14},w={x:0,y:0,has:!1,t:0},ye=!1;function Te(){if(ye||typeof window>"u")return;ye=!0;let e=t=>{w.x=t.clientX,w.y=t.clientY,w.has=!0,w.t=performance.now()};window.addEventListener("pointermove",e,{passive:!0}),window.addEventListener("pointerdown",e,{passive:!0}),window.addEventListener("blur",()=>{w.has=!1})}function qe(){return typeof window<"u"&&typeof window.matchMedia=="function"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches}var P=new Set,$=null,Q=0;function we(e){let t=Q?m((e-Q)/1e3,.001,.03333333333333333):.016666666666666666;Q=e;for(let i of P)i._frame(t,e);$=P.size?requestAnimationFrame(we):null}function Ie(e){P.add(e),$===null&&(Q=0,$=requestAnimationFrame(we))}function Be(e){P.delete(e),!P.size&&$!==null&&(cancelAnimationFrame($),$=null)}function V(e,t,i){return{x:e,v:0,to:e,k:t,d:i}}function Z(e,t){return e.v+=((e.to-e.x)*e.k-e.v*e.d)*t,e.x+=e.v*t,e.x}function Oe(e){e.x=e.to,e.v=0}var R={x:0,y:0,squash:1,phi:0};function xe(e,t,i,h,b,k){let g=Math.sqrt(Math.max(o.headR*o.headR-e*e-t*t,1)),A=e*i+g*h,C=g*i-e*h;R.x=A,R.y=t*b-C*k;let v=t*k+C*b;return R.squash=m(v/g,.25,1),R.phi=Math.atan2(R.y,A)*180/Math.PI,R}var Ne=0;function l(e,t){let i=document.createElementNS(me,e);for(let h in t)i.setAttribute(h,t[h]);return i}function ke(e,t={}){let i={expression:"idle",mouth:!1,pupils:!1,track:!0,blink:!0,idle:!0,...t},h=qe(),b=`bwf-eye-${++Ne}`,k=l("svg",{class:"bwface",viewBox:"-50 -50 100 100",xmlns:me,"aria-hidden":"true"}),g=l("defs",{}),A=l("clipPath",{id:b});A.appendChild(l("circle",{r:o.eyeR+o.clipPad,cx:0,cy:0})),g.appendChild(A);let C=l("clipPath",{id:`${b}-head`});C.appendChild(l("circle",{r:o.headR,cx:0,cy:0})),g.appendChild(C),k.appendChild(g);let v=l("g",{});v.appendChild(l("circle",{class:"bwf-head",r:o.headR})),v.appendChild(l("circle",{class:"bwf-ring",r:o.headR}));let U=l("g",{"clip-path":`url(#${b}-head)`});v.appendChild(U);let ee=l("g",{}),ge=[-1,1].map(n=>{let r=l("g",{class:"bwf-eye-group"}),a=l("g",{"clip-path":`url(#${b})`}),S=l("circle",{class:"bwf-eye",r:o.eyeR});a.appendChild(S);let y=null;i.pupils&&(y=l("circle",{class:"bwf-pupil",r:o.pupilR}),a.appendChild(y));let p=l("rect",{class:"bwf-lid",x:-22,y:-44,width:44,height:44}),d=l("rect",{class:"bwf-lid",x:-22,y:0,width:44,height:44});return a.appendChild(p),a.appendChild(d),r.appendChild(a),ee.appendChild(r),{side:n,group:r,pupil:y,lidTop:p,lidBottom:d}});U.appendChild(ee);let Y=null,T=null,q=null;i.mouth&&(q=l("g",{}),Y=l("path",{class:"bwf-mouth"}),T=l("ellipse",{class:"bwf-mouth-open",cy:2,rx:7,ry:0}),q.appendChild(T),q.appendChild(Y),U.appendChild(q)),k.appendChild(v),e.appendChild(k);let j={x:V(0,150,19),y:V(0,150,19)},s={};for(let n in x.idle)s[n]=V(x.idle[n],190,24);let D=x[i.expression]||x.idle;for(let n in D)s[n]&&(s[n].x=D[n],s[n].to=D[n]);let I=[],H=performance.now()+E(1200,4200),te={x:0,y:0},J=0,B=null,ne=!0,L=null,ie=0,K=0,ae=!0,z=()=>{L=null};window.addEventListener("scroll",z,{passive:!0,capture:!0}),window.addEventListener("resize",z,{passive:!0});let X=null;typeof IntersectionObserver=="function"&&(X=new IntersectionObserver(([n])=>{ne=n.isIntersecting},{rootMargin:"80px"}),X.observe(e));function ve(n){return(!L||n-ie>400)&&(L=e.getBoundingClientRect(),ie=n),L}function Se(n){if(B){if(n<B.until)return B;B=null}let r=!w.has||n-w.t>2200;if(i.track&&!r){let a=ve(n);if(a.width){let S=w.x-(a.left+a.width/2),y=w.y-(a.top+a.height/2),p=Math.hypot(S,y);if(p<.001)return{x:0,y:0};let d=Math.max(a.width,a.height)*2.2,_=m(p/d,0,1),G=_*(2-_);return{x:S/p*G,y:y/p*G}}}return!i.idle||h?{x:0,y:0}:(n>J&&(J=n+E(700,2600),te=Math.random()<.3?{x:0,y:0}:{x:E(-.9,.9),y:E(-.6,.6)}),te)}function oe(n,r){if(!ne)return;K&&r-K>500&&(H=r+E(900,3600),J=r+E(400,1400)),K=r;let a=Se(r),S=s.track.x;j.x.to=a.x*S,j.y.to=a.y*S;let y=Z(j.x,n),p=Z(j.y,n);for(let c in s)Z(s[c],n);i.blink&&!h&&r>H&&(I.push({def:N.blink,t:0}),H=r+(Math.random()<.24?240:E(2200,6e3)));let d={hx:0,hy:0,rot:0,sx:1,sy:1,blink:0,winkR:0};for(let c=I.length-1;c>=0;c--){let u=I[c];u.t+=n;let M=u.t/u.def.dur;if(M>=1){I.splice(c,1);continue}u.def.apply(M,d)}let _=d.hx+y*o.lean,G=d.hy+p*o.lean,Me=d.rot+s.head.x;v.setAttribute("transform",`translate(${_.toFixed(2)} ${G.toFixed(2)}) rotate(${Me.toFixed(2)}) scale(${d.sx.toFixed(3)} ${d.sy.toFixed(3)})`);let se=y*o.turn,re=-p*o.turn,le=Math.cos(se),ce=Math.sin(se),de=Math.cos(re),pe=Math.sin(re),Fe=m(s.lidT.x,0,1),Ee=m(s.lidB.x,0,1),Re=s.tilt.x,ue=s.eyeScale.x;for(let c of ge){let u=c.side>0?Math.max(d.blink,d.winkR):d.blink,M=m(Fe+(c.side>0?s.lidSkew.x:0),0,1),F=ue,$e=ue*s.squashY.x*(1-u*.94),O=xe(c.side*o.eyeX*s.gap.x,o.eyeY+s.eyeY.x,le,ce,de,pe);c.group.setAttribute("transform",`translate(${O.x.toFixed(2)} ${O.y.toFixed(2)}) rotate(${O.phi.toFixed(2)}) scale(${O.squash.toFixed(3)} 1) rotate(${(-O.phi).toFixed(2)}) scale(${F.toFixed(3)} ${Math.max($e,.001).toFixed(3)})`);let he=-c.side*Re,fe=2*o.eyeR+o.lidSlack;c.lidTop.setAttribute("transform",`rotate(${he.toFixed(2)}) translate(0 ${(-o.eyeR+M*fe).toFixed(2)})`),c.lidBottom.setAttribute("transform",`rotate(${he.toFixed(2)}) translate(0 ${(o.eyeR-Ee*fe).toFixed(2)})`),c.pupil&&c.pupil.setAttribute("transform",`translate(${(y*o.pupilTravel).toFixed(2)} ${(p*o.pupilTravel).toFixed(2)})`)}if(Y){let c=s.mouth.x,u=m(s.open.x,0,1),M=o.mouthW,F=xe(0,o.mouthY,le,ce,de,pe);q.setAttribute("transform",`translate(${F.x.toFixed(2)} ${F.y.toFixed(2)}) rotate(${F.phi.toFixed(2)}) scale(${F.squash.toFixed(3)} 1) rotate(${(-F.phi).toFixed(2)})`),Y.setAttribute("d",`M ${-M} 0 Q 0 ${(c*11).toFixed(2)} ${M} 0`),Y.setAttribute("opacity",(1-u).toFixed(3)),T.setAttribute("rx",(6.5+u*2.5).toFixed(2)),T.setAttribute("ry",(u*8).toFixed(2)),T.setAttribute("opacity",u.toFixed(3))}}let f={el:k,_frame:oe,setExpression(n){let r=x[n];if(!r)return f;for(let a in s)s[a].to=a in r?r[a]:x.idle[a];return f},react(n,{force:r=!1}={}){let a=N[n];return!a||h&&!r||I.push({def:a,t:0}),f},look(n,r,a=900){return B={x:m(n,-1,1),y:m(r,-1,1),until:performance.now()+a},f},set(n){return Object.assign(i,n),f},destroy(){ae&&(ae=!1,Be(f),X&&X.disconnect(),window.removeEventListener("scroll",z,{capture:!0}),window.removeEventListener("resize",z),k.remove())}};if(h)for(let n in s)Oe(s[n]);return Te(),Ie(f),oe(1/60,performance.now()),f}var be=!1;function Pe(){if(be||typeof document>"u")return;be=!0;let e=document.createElement("style");e.dataset.bwface="",e.textContent=`/* Everything about how a face *looks* is here, driven by four custom
   properties. Set them on the face or on any ancestor.

     --face-skin   the big circle (and the lids, which have to match)
     --face-ink    the eyes and mouth
     --face-ring   optional hairline around the head; transparent by default
     --face-pupil  inner dot when pupils are on; defaults to --face-skin  */

.bwface {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.bwface .bwf-head {
  fill: var(--face-skin, #17191c);
}

.bwface .bwf-ring {
  fill: none;
  stroke: var(--face-ring, transparent);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.bwface .bwf-eye {
  fill: var(--face-ink, #f7f9f9);
}

/* Lids are cut out of the head colour \u2014 they have to match it exactly or the
   seam shows. */
.bwface .bwf-lid {
  fill: var(--face-skin, #17191c);
}

.bwface .bwf-pupil {
  fill: var(--face-pupil, var(--face-skin, #17191c));
}

.bwface .bwf-mouth {
  fill: none;
  stroke: var(--face-ink, #f7f9f9);
  stroke-width: 3.2;
  stroke-linecap: round;
}

.bwface .bwf-mouth-open {
  fill: var(--face-ink, #f7f9f9);
}
`,document.head.appendChild(e)}function _e(e,t){return Pe(),ke(e,t)}export{x as EXPRESSIONS,Ae as EXPRESSION_NAMES,N as REACTIONS,Ye as REACTION_NAMES,_e as createFace};
