import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import {WindDecor,type WindDecorCell} from './windDecor';

function fixture(count=4) {
  const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial(),count);
  for(let i=0;i<count;i++) mesh.setMatrixAt(i,new THREE.Matrix4().makeTranslation(0.5,3+i*0.1,0.5));
  return {mesh,y:(i:number)=>mesh.instanceMatrix.array[i*16+13],dispose:()=>{mesh.dispose();mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();}};
}
const cell=(first:number,count=1):WindDecorCell=>({x:0.5,y:3,z:0.5,first,count,color:0x55aa22});
describe('temporary wind damage to decorative plants',()=> {
  it('scatters one registered plant cluster, keeps tree pieces intact and restores the exact matrices',()=> {
    const f=fixture(),wind=new WindDecor(),effect=vi.fn(),before=Array.from(f.mesh.instanceMatrix.array);
    wind.register(f.mesh,[cell(0,2)],0,0);wind.disturb(new THREE.Vector3(0.5,3,0.5),0,effect);
    expect(f.y(0)).toBe(-1000);expect(f.y(1)).toBe(-1000);expect(f.y(2)).toBeCloseTo(3.2);expect(f.y(3)).toBeCloseTo(3.3);
    wind.disturb(new THREE.Vector3(0.5,3,0.5),1,effect);expect(effect).toHaveBeenCalledOnce();
    wind.disturb(null,29,effect);expect(f.y(0)).toBe(-1000);
    wind.disturb(null,30,effect);expect(Array.from(f.mesh.instanceMatrix.array)).toEqual(before);
    wind.dispose();f.dispose();
  });
  it('ignores distant and elevated decoration',()=> {
    const f=fixture(),wind=new WindDecor(),effect=vi.fn();wind.register(f.mesh,[cell(0)],0,0);
    wind.disturb(new THREE.Vector3(100,3,100),0,effect);wind.disturb(new THREE.Vector3(0.5,8,0.5),1,effect);
    expect(effect).not.toHaveBeenCalled();expect(f.y(0)).toBe(3);wind.dispose();f.dispose();
  });
  it('caps temporary damage and frees the budget when a decorated chunk unloads',()=> {
    const f=fixture(64),wind=new WindDecor(),effect=vi.fn();wind.register(f.mesh,Array.from({length:64},(_,i)=>cell(i)),0,0);
    for(let i=0;i<80;i++) wind.disturb(new THREE.Vector3(0.5,3,0.5),i*0.01,effect);
    expect(effect).toHaveBeenCalledTimes(48);f.dispose();
    const next=fixture(1);wind.register(next.mesh,[cell(0)],0,0);wind.disturb(new THREE.Vector3(0.5,3,0.5),1,effect);
    expect(effect).toHaveBeenCalledTimes(49);wind.dispose();expect(next.y(0)).toBe(3);next.dispose();
  });
});
