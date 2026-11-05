#!/usr/bin/env python3
"""Pocketcraft · Minecraft-Modelle auslesen (für games/pocketcraft/mcwesen.js)

Minecraft baut seine Wesen im Code zusammen (createBodyLayer & Co. mit
CubeListBuilder und PartDefinition). Seit 26.1 ist dieser Code nicht mehr
verschleiert. Dieses Werkzeug liest ihn mit javap aus der eigenen
client.jar und rechnet die Baupläne nach — Maße, Gelenke und Bildstellen
der Kästen — und schreibt sie als MC_MODELLE in mcwesen.js.

    python3 werkzeug/mc-modelle.py ~/.minecraft/versions/26.3/26.3.jar

Braucht javap (ein JDK) und unzip. Die Bilder selbst bleiben in der jar:
die holt sich Pocketcraft im Browser aus der jar des Spielers."""
import re, json, subprocess, sys, os, math, tempfile

ROOT = tempfile.mkdtemp(prefix='mc-modelle-')
JAR = None
_cache = {}

def klasse(name):
    """name: net/minecraft/... ohne .class → {methodenname+deskriptor: [(offset, op, args, kommentar)]}"""
    if name in _cache: return _cache[name]
    pfad = os.path.join(ROOT, name + '.class')
    if not os.path.exists(pfad):
        r = subprocess.run(['unzip', '-o', '-q', JAR, name + '.class', '-d', ROOT], capture_output=True)
        if not os.path.exists(pfad): _cache[name] = None; return None
    env = dict(os.environ, JAVA_TOOL_OPTIONS='')
    out = subprocess.run(['javap', '-c', '-p', '-s', pfad], capture_output=True, text=True, env=env).stdout
    meth = {}; cur = None; sig = None
    for line in out.splitlines():
        m = re.match(r'^  (?:[\w.<>$,\[\] ]+ )?([\w$<>]+)\((.*)\);$', line)
        if m and not line.startswith('    '):
            cur = m.group(1); sig = None; continue
        m = re.match(r'^    descriptor: (.*)$', line)
        if m and cur:
            sig = cur + m.group(1); meth[sig] = []; continue
        m = re.match(r'^\s+(\d+): (\w+)\s*(.*?)\s*(?://\s*(.*))?$', line)
        if m and sig:
            meth[sig].append((int(m.group(1)), m.group(2), m.group(3), m.group(4) or ''))
    _cache[name] = meth
    return meth

def args_of(desc):
    inner = desc[desc.index('(')+1:desc.index(')')]
    res = []; i = 0
    while i < len(inner):
        c = inner[i]
        if c == 'L': j = inner.index(';', i); res.append(inner[i+1:j]); i = j+1
        elif c == '[':
            j = i
            while inner[j] == '[': j += 1
            if inner[j] == 'L': j = inner.index(';', j)
            res.append(inner[i:j+1]); i = j+1
        else: res.append(c); i += 1
    return res, desc[desc.index(')')+1:]

class Obj:
    def __init__(self, cls, **kw): self.cls = cls; self.__dict__.update(kw)
    def __repr__(self): return '<%s>' % self.cls

def part(cubes=None, pose=None): return Obj('Part', cubes=cubes or [], pose=pose or [0]*6, children={})
def tojson(p):
    return { 'pose': p.pose, 'cubes': p.cubes, 'children': { k: tojson(v) for k, v in p.children.items() } }

def call(owner, name, desc, args):
    """Aufruf einer Methode: bekannte API nachbilden, sonst Bytecode ausführen"""
    simple = owner.split('/')[-1]
    a = args
    if simple == 'CubeListBuilder':
        if name == 'create': return Obj('B', cubes=[], u=0, v=0, mirror=False)
        b = a[0]
        if name == 'texOffs': b.u, b.v = a[1], a[2]; return b
        if name == 'mirror': b.mirror = a[1] if len(a) > 1 else True; return b
        if name == 'addBox':
            ps, _ = args_of(desc); vals = a[1:]
            if ps[0] == 'java/lang/String': vals = vals[1:]; ps = ps[1:]
            x, y, z, w, h, d = [float(v) for v in vals[:6]]
            rest = vals[6:]; prest = ps[6:]
            grow = [0, 0, 0]; u, v = b.u, b.v; mirror = b.mirror
            for t, val in zip(prest, rest):
                if t.endswith('CubeDeformation'): grow = [val.gx, val.gy, val.gz]
                elif t == 'Z': mirror = bool(val)
            if ps[3] == 'I' and len(rest) >= 2 and prest[-2:] == ['I', 'I']: u, v = rest[-2], rest[-1]
            b.cubes.append({ 'o':[x, y, z], 'd':[w, h, d], 'uv':[u, v], 'g':grow, 'm':mirror })
            return b
    if simple == 'CubeDeformation':
        if name == '<init>':
            o = a[0]
            if len(a) == 2: o.gx = o.gy = o.gz = a[1]
            else: o.gx, o.gy, o.gz = a[1], a[2], a[3]
            return None
        if name == 'extend':
            o = a[0]
            if len(a) == 2: return Obj('D', gx=o.gx + a[1], gy=o.gy + a[1], gz=o.gz + a[1])
            return Obj('D', gx=o.gx + a[1], gy=o.gy + a[2], gz=o.gz + a[3])
    if simple == 'PartPose':
        if name == 'offset': return [a[0], a[1], a[2], 0, 0, 0]
        if name == 'rotation': return [0, 0, 0, a[0], a[1], a[2]]
        if name == 'offsetAndRotation': return list(a[:6])
        if name in ('translated', 'withScale', 'scaled'): return a[0]
    if simple == 'MeshDefinition':
        if name == '<init>': a[0].root = part(); return None
        if name == 'getRoot': return a[0].root
        if name in ('transformed', 'apply'): return a[0]
    if simple == 'PartDefinition':
        p = a[0]
        if name == 'addOrReplaceChild':
            if len(a) == 4:
                c = part([dict(c) for c in a[2].cubes], a[3])
            else: c = a[2]
            p.children[a[1]] = c; return c
        if name == 'getChild': return p.children.get(a[1]) or part()
        if name == 'clearChild': p.children[a[1]] = part(); return p
        if name == 'clearRecursively': p.cubes = []; return p
    if simple == 'LayerDefinition' and name == 'create':
        return Obj('Layer', mesh=a[0], w=a[1], h=a[2])
    if owner.startswith('net/minecraft/client/model/'):
        k = klasse(owner)
        if k and (name + desc) in k: return run(owner, name + desc, args)
    _, ret = args_of(desc)
    return None if ret == 'V' else Obj('?' + simple + '.' + name)

def const(argtxt, kommentar):
    m = re.match(r'(float|int|double|long|String)\s+(.*)$', kommentar)
    if not m: return None
    t, v = m.groups()
    if t == 'String': return v
    if t in ('float', 'double'): return float(v.rstrip('fFdD'))
    return int(v.rstrip('lL'))

def run(owner, sig, args):
    code = klasse(owner)[sig]
    idx = { off: i for i, (off, *_ ) in enumerate(code) }
    loc = list(args) + [None]*40
    st = []; i = 0
    while i < len(code):
        off, op, arg, kom = code[i]; i += 1
        if op.startswith('iconst_'): st.append(-1 if op.endswith('m1') else int(op[-1]))
        elif op.startswith('fconst_'): st.append(float(op[-1]))
        elif op in ('bipush', 'sipush'): st.append(int(arg))
        elif op in ('ldc', 'ldc_w', 'ldc2_w'): st.append(const(arg, kom))
        elif re.match(r'[ifadl]load(_\d)?$', op): st.append(loc[int(op[-1]) if '_' in op else int(arg)])
        elif re.match(r'[ifadl]store(_\d)?$', op): loc[int(op[-1]) if '_' in op else int(arg)] = st.pop()
        elif op in ('fadd', 'iadd', 'dadd'): b = st.pop(); st.append(st.pop() + b)
        elif op in ('fsub', 'isub', 'dsub'): b = st.pop(); st.append(st.pop() - b)
        elif op in ('fmul', 'imul', 'dmul'): b = st.pop(); st.append(st.pop() * b)
        elif op in ('fdiv', 'ddiv'): b = st.pop(); st.append(st.pop() / b)
        elif op in ('fneg', 'ineg'): st.append(-st.pop())
        elif op in ('i2f', 'f2d', 'd2f', 'i2d', 'checkcast'): pass
        elif op == 'f2i': st.append(int(st.pop()))
        elif op == 'dup': st.append(st[-1])
        elif op == 'pop': st.pop()
        elif op == 'new':
            cls = kom.split()[-1]
            st.append(Obj('D' if cls.endswith('CubeDeformation') else cls.split('/')[-1]))
        elif op == 'getstatic':
            f = kom.split()[-1]
            if 'CubeDeformation.NONE' in f: st.append(Obj('D', gx=0.0, gy=0.0, gz=0.0))
            elif 'PartPose.ZERO' in f: st.append([0, 0, 0, 0, 0, 0])
            else: st.append(Obj('static ' + f))
        elif op.startswith('invoke'):
            m = re.match(r'(?:Method|InterfaceMethod) (?:([\w/$]+)\.)?("?[\w$<>]+"?):(\S+)', kom)
            if not m: raise Exception('unbekannt: ' + kom)
            ow = m.group(1) or owner; nm = m.group(2).strip('"'); ds = m.group(3)
            ps, ret = args_of(ds)
            n = len(ps) + (0 if op == 'invokestatic' else 1)
            a = st[len(st)-n:] if n else []
            del st[len(st)-n:]
            r = call(ow, nm, ds, a)
            if ret != 'V': st.append(r)
        elif op in ('ifeq', 'ifne'):
            v = st.pop(); t = int(arg)
            if (not v) == (op == 'ifeq'): i = idx[t]
        elif op == 'goto': i = idx[int(arg)]
        elif op in ('areturn', 'freturn', 'ireturn'): return st.pop()
        elif op == 'return': return None
        elif op == 'aconst_null': st.append(None)
        else: raise Exception('Befehl %s bei %s %s' % (op, owner, sig))
    return None

def modell(owner, sig, args=()):
    r = run(owner, sig, list(args))
    mesh = r.mesh if getattr(r, 'cls', '') == 'Layer' else r
    out = tojson(mesh.root)
    if getattr(r, 'cls', '') == 'Layer': out['tex'] = [r.w, r.h]
    return out

L = 'Lnet/minecraft/client/model/geom/builders/'
M = 'net/minecraft/client/model/'
NONE = lambda: Obj('D', gx=0.0, gy=0.0, gz=0.0)
# Pocketcraft-Name → (Klasse, Methode, Argumente, Bildgröße falls die Methode keine nennt)
MODELLE = {
    'pig': (M+'animal/pig/PigModel', 'createBodyLayer(%sCubeDeformation;)%sLayerDefinition;' % (L, L), [NONE()], None),
    'cow': (M+'animal/cow/CowModel', 'createBodyLayer()%sLayerDefinition;' % L, [], None),
    'chicken': (M+'animal/chicken/AdultChickenModel', 'createBodyLayer()%sLayerDefinition;' % L, [], None),
    'sheep': (M+'animal/sheep/SheepModel', 'createBodyLayer()%sLayerDefinition;' % L, [], None),
    'sheep_fur': (M+'animal/sheep/SheepFurModel', 'createFurLayer()%sLayerDefinition;' % L, [], None),
    'zombie': (M+'HumanoidModel', 'createMesh(%sCubeDeformation;F)%sMeshDefinition;' % (L, L), [NONE(), 0.0], [64, 64]),
    'skeleton': (M+'monster/skeleton/SkeletonModel', 'createBodyLayer()%sLayerDefinition;' % L, [], None),
    'slime_outer': (M+'monster/slime/SlimeModel', 'createOuterBodyLayer()%sLayerDefinition;' % L, [], None),
    'slime_inner': (M+'monster/slime/SlimeModel', 'createInnerBodyLayer()%sLayerDefinition;' % L, [], None),
    'villager': (M+'npc/VillagerModel', 'createBodyModel()%sMeshDefinition;' % L, [], [64, 64]),
    'golem': (M+'animal/golem/IronGolemModel', 'createBodyLayer()%sLayerDefinition;' % L, [], None),
    'player': (M+'player/PlayerModel', 'createMesh(%sCubeDeformation;Z)%sMeshDefinition;' % (L, L), [NONE(), 0], [64, 64]),
    'chest': (M+'object/chest/ChestModel', 'createSingleBodyLayer()%sLayerDefinition;' % L, [], None),
}

def kurz(p):
    """kompakt für JavaScript: p = Lage, c = Kästen, k = Kinder"""
    r = lambda x: (lambda y: int(y) if y == int(y) else y)(round(x, 4))
    out = {'p': [r(v) for v in p['pose']]}
    if p['cubes']:
        out['c'] = [[*map(r, c['o']), *map(r, c['d']), c['uv'][0], c['uv'][1], *map(r, c['g']), 1 if c['m'] else 0] for c in p['cubes']]
    if p['children']: out['k'] = {k: kurz(v) for k, v in p['children'].items()}
    return out

if __name__ == '__main__':
    if len(sys.argv) < 2: sys.exit(__doc__)
    JAR = os.path.abspath(sys.argv[1])
    alle = {}
    for name, (klasse_, methode, args, tex) in MODELLE.items():
        m = modell(klasse_, methode, args)
        k = kurz(m); k['t'] = tex or m['tex']; alle[name] = k
        print(name, k['t'], file=sys.stderr)
    ziel = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'games', 'pocketcraft', 'mcwesen.js')
    js = open(ziel, encoding='utf8').read()
    js = re.sub(r'const MC_MODELLE = .*?;\n', lambda _: 'const MC_MODELLE = ' + json.dumps(alle, separators=(',', ':')) + ';\n', js, count=1, flags=re.S)
    open(ziel, 'w', encoding='utf8').write(js)
    print('geschrieben:', ziel, file=sys.stderr)
