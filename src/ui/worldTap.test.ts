import * as THREE from 'three';
import { describe,expect,it } from 'vitest';
import type { Ctx } from '../core/ctx';
import { tappedAt,tappedInBox } from './worldTap';

function fixture(width:number,height:number) {
  const camera=new THREE.PerspectiveCamera(45,width/height,0.1,200);
  camera.position.set(0,15,10);camera.lookAt(0,3,0);camera.updateMatrixWorld();
  const taps:{x:number;y:number}[]=[];
  const ctx={camera,renderer:{domElement:{getBoundingClientRect:()=>({left:23,top:11,width,height})}},input:{taps,takeTap:(x:number,y:number,r:number)=>{
    const i=taps.findIndex(t=>Math.hypot(t.x-x,t.y-y)<r);if(i<0) return false;taps.splice(i,1);return true;
  }}} as unknown as Ctx;
  const touch=(p:THREE.Vector3)=>{const v=p.clone().project(camera);taps.push({x:23+(v.x+1)*width/2,y:11+(1-v.y)*height/2});};
  return {ctx,taps,touch};
}
describe('touching tall toys',()=> {
  it.each([[2318,1343],[1280,800],[390,844]])('accepts the upper curls and consumes the tap at %sx%s',(width,height)=> {
    const {ctx,taps,touch}=fixture(width,height);
    const base=new THREE.Vector3(0,3,0),box=new THREE.Box3(new THREE.Vector3(-2.2,3,-2.2),new THREE.Vector3(2.2,7.7,2.2));
    touch(new THREE.Vector3(0,7.1,0));
    if(width>1000) expect(tappedAt(ctx,base.clone().setY(4.6),1.2)).toBe(false);
    expect(tappedInBox(ctx,box)).toBe(true);expect(taps).toHaveLength(0);
  });
  it('leaves unrelated taps available for other things in the world',()=> {
    const {ctx,taps}=fixture(1280,800);taps.push({x:24,y:12});
    expect(tappedInBox(ctx,new THREE.Box3(new THREE.Vector3(-2,3,-2),new THREE.Vector3(2,8,2)))).toBe(false);
    expect(taps).toHaveLength(1);
  });
});
