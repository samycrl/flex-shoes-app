/**
 * Flex Shoes — App.js v9
 * ✓ Integrare Gomag API — produse reale, categorii reale
 * ✓ Fallback la produse mock dacă API nu răspunde
 * ✓ Loading state + paginare produse
 */

import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  TextInput, FlatList, Image, SafeAreaView, Animated,
  Easing, Pressable, Platform, Switch, ActivityIndicator,
  Linking
} from 'react-native';
import { useState, useRef, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Gomag API Config ────────────────────────────────────────────────
const GOMAG_SHOP  = 'www.flex-shoes.ro';
const GOMAG_TOKEN = '6032bba16f5dde9253703c8466b98810';
const GOMAG_USER  = 'samuel_samyy@icloud.com';
const GOMAG_BASE  = `https://${GOMAG_SHOP}/gomag/api`;

const gomagFetch = async (endpoint, params = {}) => {
  const qs = new URLSearchParams({ per_page: 100, ...params }).toString();
  const url = `${GOMAG_BASE}/${endpoint}?${qs}`;
  const res = await fetch(url, {
    headers: {
      'X-Auth-Token': GOMAG_TOKEN,
      'X-Auth-User':  GOMAG_USER,
      'User-Agent':   'FlexShoesApp/1.0',
      'Accept':       'application/json',
    },
  });
  if (!res.ok) throw new Error(`Gomag API ${res.status}`);
  return res.json();
};

// Normalizează un produs Gomag → formatul intern al aplicației
const normalizeProduct = (p) => ({
  id:        p.id_product || p.id,
  name:      p.name || p.denumire || '',
  sub:       p.category_name || p.categorie || '',
  cat:       normalizeCat(p.category_name || ''),
  price:     parseFloat(p.price_sale || p.price || p.pret || 0),
  oldPrice:  p.price_old && parseFloat(p.price_old) > parseFloat(p.price_sale || p.price || 0)
               ? parseFloat(p.price_old) : null,
  badge:     p.is_new == 1 ? 'NOU' : (p.price_old && parseFloat(p.price_old) > 0 ? 'REDUCERE' : null),
  stock:     parseInt(p.stock || p.stoc || 0),
  sizes:     parseSizes(p.attributes || p.atribute || []),
  colors:    parseColors(p.attributes || p.atribute || []),
  img:       p.image_link || p.imagine || p.images?.[0]?.link || '',
  slug:      p.link_product || p.slug || '',
  description: p.description || p.descriere || p.short_description || '',
});

const normalizeCat = (catName = '') => {
  const n = catName.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (n.includes('femei') || n.includes('dame') || n.includes('dama') || n.includes('woman') || n.includes('lady')) return 'femei';
  if (n.includes('barbat') || n.includes('barbati') || n.includes('men') || n.includes('man') || n.includes('baiat')) return 'barbati';
  if (n.includes('copii') || n.includes('copil') || n.includes('kid') || n.includes('child') || n.includes('junior')) return 'copii';
  if (n.includes('acces') || n.includes('geant') || n.includes('curea') || n.includes('portofel') || n.includes('bag')) return 'accesorii';
  return 'femei';
};

const parseSizes = (attrs = []) => {
  const sizeAttr = Array.isArray(attrs)
    ? attrs.find(a => (a.name||a.denumire||'').toLowerCase().includes('măr') || (a.name||'').toLowerCase().includes('mar'))
    : null;
  if (!sizeAttr) return [];
  const vals = sizeAttr.values || sizeAttr.valori || [];
  return vals.map(v => parseInt(v.name || v.denumire || v)).filter(n => !isNaN(n)).sort((a,b)=>a-b);
};

const parseColors = (attrs = []) => {
  const colorAttr = Array.isArray(attrs)
    ? attrs.find(a => (a.name||a.denumire||'').toLowerCase().includes('culoare') || (a.name||'').toLowerCase().includes('color'))
    : null;
  if (!colorAttr) return ['Standard'];
  const vals = colorAttr.values || colorAttr.valori || [];
  return vals.map(v => v.name || v.denumire || v).filter(Boolean);
};


// ─── Palette ────────────────────────────────────────────────────────
const G    = '#1B6B47';
const GD   = '#145236';
const GL   = '#EAF3EE';
const RED  = '#CC2222';
const W    = '#FFFFFF';
const L    = '#F7F7F7';
const B    = '#E8E8E8';
const GR   = '#888888';
const BK   = '#111111';
const PINK = '#E8325A';

// ─── Data ────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id:'all',       label:'Toate',     icon:'🛍️' },
  { id:'femei',     label:'Femei',     icon:'👠', subs:['Pantofi Eleganți','Pantofi Casual','Ghete Elegante','Ghete Casual','Balerini','Sandale'] },
  { id:'barbati',   label:'Bărbați',   icon:'👞', subs:['Pantofi Eleganți','Pantofi Casual','Ghete','Sandale'] },
  { id:'copii',     label:'Copii',     icon:'🥿', subs:['Pantofi','Ghete'] },
  { id:'accesorii', label:'Accesorii', icon:'👜', subs:['Gențe','Curele','Portofele'] },
];

// ─── Mock fallback (folosit când API e indisponibil) ─────────────────
const MOCK_PRODUCTS = [
  { id:1,  name:'Pantofi Damă Eleganți Din Piele Naturală 20151',  sub:'Pantofi Eleganți', cat:'femei',   price:320, oldPrice:null, badge:'NOU',    stock:1, sizes:[35,36,37,38,39,40],    colors:['Negru','Maro','Nude'], img:'https://gomagcdn.ro/domains/flex-shoes.ro/files/product/medium/20220418_162040-5825-7654.jpg' },
  { id:2,  name:'Ghete Damă Elegante Din Piele Naturală 40103',    sub:'Ghete Elegante',   cat:'femei',   price:420, oldPrice:null, badge:null,     stock:1, sizes:[35,36,37,38,39,40,41], colors:['Negru'],              img:'https://gomagcdn.ro/domains/flex-shoes.ro/files/product/medium/ghete-dama-elegante-din-piele-naturala-neagra-9508-235109.jpg' },
  { id:3,  name:'Pantofi Damă Casual Confort Din Piele Naturală',  sub:'Pantofi Casual',   cat:'femei',   price:230, oldPrice:null, badge:null,     stock:4, sizes:[35,36,37,38,39,40],    colors:['Negru'],              img:'https://gomagcdn.ro/domains/flex-shoes.ro/files/product/medium/pantofi-dama-casual-confort-din-piele-naturala-neagra-5118-254036.jpg' },
  { id:4,  name:'Balerini Damă Din Piele Naturală',                sub:'Balerini',         cat:'femei',   price:150, oldPrice:null, badge:null,     stock:5, sizes:[35,36,37,38,39,40],    colors:['Roșu','Negru'],       img:'https://gomagcdn.ro/domains/flex-shoes.ro/files/product/medium/balerine-dama-din-piele-naturala-verde-8003-061958.jpg' },
  { id:5,  name:'Pantofi Damă Eleganți Piele Naturală Bordo 20745',sub:'Pantofi Eleganți', cat:'femei',   price:325, oldPrice:399,  badge:'REDUCERE',stock:2, sizes:[35,36,37,38,39,40],    colors:['Bordo'],              img:'https://gomagcdn.ro/domains/flex-shoes.ro/files/product/medium/pantofi-dama-eleganti-din-piele-naturala-161682-025985.jpg' },
  { id:6,  name:'Ghete Damă Casual Din Piele Naturală 30280',      sub:'Ghete Casual',     cat:'femei',   price:290, oldPrice:349,  badge:'REDUCERE',stock:1, sizes:[36,37,38,39,40],       colors:['Maro','Negru'],       img:'https://gomagcdn.ro/domains/flex-shoes.ro/files/product/medium/ghete-dama-casual-din-piele-naturala-8710-141718.jpg' },
  { id:7,  name:'Pantofi Damă Eleganți Din Piele Naturală 20163',  sub:'Pantofi Eleganți', cat:'femei',   price:350, oldPrice:null, badge:null,     stock:1, sizes:[35,36,37,38,39,40],    colors:['Auriu','Negru'],      img:'https://gomagcdn.ro/domains/flex-shoes.ro/files/product/medium/9880vl-au-1021-4251.jpg' },
  { id:8,  name:'Ghete Damă Elegante Din Piele Naturală 40170',    sub:'Ghete Elegante',   cat:'femei',   price:320, oldPrice:null, badge:'NOU',    stock:3, sizes:[36,37,38,39,40,41],    colors:['Negru'],              img:'https://gomagcdn.ro/domains/flex-shoes.ro/files/product/medium/ghete-dama-elegante-din-piele-naturala-neagra-9606-808263.jpg' },
  { id:9,  name:'Pantofi Bărbați Eleganți Din Piele Naturală',     sub:'Pantofi Eleganți', cat:'barbati', price:380, oldPrice:450,  badge:'REDUCERE',stock:3, sizes:[40,41,42,43,44],       colors:['Negru','Maro'],       img:'https://gomagcdn.ro/domains/flex-shoes.ro/files/product/medium/pantofi-dama-casual-confort-din-piele-naturala-neagra-5118-254036.jpg' },
  { id:10, name:'Ghete Bărbați Casual Din Piele Naturală',         sub:'Ghete',            cat:'barbati', price:420, oldPrice:null, badge:'NOU',    stock:2, sizes:[40,41,42,43,44,45],    colors:['Maro','Negru'],       img:'https://gomagcdn.ro/domains/flex-shoes.ro/files/product/medium/ghete-dama-casual-din-piele-naturala-8710-141718.jpg' },
  { id:11, name:'Pantofi Bărbați Casual Din Piele Naturală',       sub:'Pantofi Casual',   cat:'barbati', price:299, oldPrice:null, badge:null,     stock:4, sizes:[39,40,41,42,43],       colors:['Maro'],               img:'https://gomagcdn.ro/domains/flex-shoes.ro/files/product/medium/9880vl-au-1021-4251.jpg' },
  { id:12, name:'Geantă Din Piele Naturală',                       sub:'Gențe',            cat:'accesorii',price:280,oldPrice:null, badge:null,     stock:3, sizes:[],                     colors:['Negru','Maro','Camel'],img:'https://gomagcdn.ro/domains/flex-shoes.ro/files/product/medium/pantofi-dama-eleganti-din-piele-naturala-161682-025985.jpg' },
];

// ─── Hook: încarcă produse din Gomag API ─────────────────────────────
function useProducts() {
  const [products,  setProducts]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [apiOnline, setApiOnline] = useState(false);
  const [page,      setPage]      = useState(1);
  const [hasMore,   setHasMore]   = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(async (pageNum = 1, append = false) => {
    try {
      pageNum === 1 ? setLoading(true) : setLoadingMore(true);
      const data = await gomagFetch('products', {
        page: pageNum,
        
        status: 1,           // doar produse active
        has_stock: 0,        // toate (și fără stoc)
      });

      // Gomag returnează { products: [...] } sau direct array
      const raw = data?.products || data?.data || (Array.isArray(data) ? data : []);
      const normalized = raw.map(normalizeProduct).filter(p => p.name && p.price > 0);

      if (append) {
        setProducts(prev => [...prev, ...normalized]);
      } else {
        setProducts(normalized);
      }

      setHasMore(raw.length === 50);  // dacă a returnat 50, mai sunt pagini
      setApiOnline(true);
    } catch (err) {
      console.log('Gomag API error:', err.message);
      if (pageNum === 1) {
        setProducts(MOCK_PRODUCTS);   // fallback la mock
        setApiOnline(false);
      }
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { fetchPage(1); }, []);

  const loadMore = () => {
    if (!hasMore || loadingMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPage(nextPage, true);
  };

  const refresh = () => {
    setPage(1);
    fetchPage(1, false);
  };

  return { products, loading, apiOnline, loadMore, hasMore, loadingMore, refresh };
}

const JUDETE = ['Alba','Arad','Argeș','Bacău','Bihor','Bistrița-Năsăud','Botoșani','Brăila','Brașov','București','Buzău','Călărași','Cluj','Constanța','Covasna','Dâmbovița','Dolj','Galați','Giurgiu','Gorj','Harghita','Hunedoara','Ialomița','Iași','Ilfov','Maramureș','Mehedinți','Mureș','Neamț','Olt','Prahova','Sălaj','Satu Mare','Sibiu','Suceava','Teleorman','Timiș','Tulcea','Vâlcea','Vaslui','Vrancea'];

// ─── Animation helpers ────────────────────────────────────────────────
function FadeIn({ children, delay=0, style }) {
  const op = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(14)).current;
  useEffect(()=>{
    Animated.parallel([
      Animated.timing(op,{toValue:1,duration:340,delay,easing:Easing.out(Easing.cubic),useNativeDriver:true}),
      Animated.timing(ty,{toValue:0,duration:340,delay,easing:Easing.out(Easing.cubic),useNativeDriver:true}),
    ]).start();
  },[]);
  return <Animated.View style={[{opacity:op,transform:[{translateY:ty}]},style]}>{children}</Animated.View>;
}

function PressScale({ children, onPress, style, sc=0.95 }) {
  const sv = useRef(new Animated.Value(1)).current;
  const go = ()=>{
    Animated.sequence([
      Animated.spring(sv,{toValue:sc,useNativeDriver:true,speed:60,bounciness:2}),
      Animated.spring(sv,{toValue:1, useNativeDriver:true,speed:40,bounciness:10}),
    ]).start();
    onPress&&onPress();
  };
  return (
    <Pressable onPress={go} style={style}>
      <Animated.View style={{transform:[{scale:sv}]}}>{children}</Animated.View>
    </Pressable>
  );
}

function Shimmer({ style }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(()=>{
    Animated.loop(Animated.sequence([
      Animated.timing(a,{toValue:1,duration:800,easing:Easing.inOut(Easing.ease),useNativeDriver:false}),
      Animated.timing(a,{toValue:0,duration:800,easing:Easing.inOut(Easing.ease),useNativeDriver:false}),
    ])).start();
  },[]);
  return <Animated.View style={[style,{backgroundColor:a.interpolate({inputRange:[0,1],outputRange:['#ECECEC','#F5F5F5']})}]}/>;
}

function HeartBtn({ productId, favorites, toggleFav, size=18, style }) {
  const isFav = favorites.includes(productId);
  const sc = useRef(new Animated.Value(1)).current;
  const press = ()=>{
    Animated.sequence([
      Animated.spring(sc,{toValue:1.5,useNativeDriver:true,speed:80,bounciness:4}),
      Animated.spring(sc,{toValue:1,  useNativeDriver:true,speed:50,bounciness:14}),
    ]).start();
    toggleFav(productId);
  };
  return (
    <Pressable onPress={press} style={[s.heartBtn,style]} hitSlop={{top:8,bottom:8,left:8,right:8}}>
      <Animated.Text style={{fontSize:size,color:isFav?PINK:'#C0C0C0',transform:[{scale:sc}]}}>
        {isFav?'♥':'♡'}
      </Animated.Text>
    </Pressable>
  );
}

function ScreenFade({ children, k }) {
  const op = useRef(new Animated.Value(0)).current;
  useEffect(()=>{
    op.setValue(0);
    Animated.timing(op,{toValue:1,duration:220,easing:Easing.out(Easing.quad),useNativeDriver:true}).start();
  },[k]);
  return <Animated.View style={{flex:1,opacity:op}}>{children}</Animated.View>;
}

// ─── Toast ────────────────────────────────────────────────────────────
function Toast({ item, onHide }) {
  const ty = useRef(new Animated.Value(100)).current;
  const op = useRef(new Animated.Value(0)).current;
  useEffect(()=>{
    Animated.parallel([
      Animated.spring(ty,{toValue:0,useNativeDriver:true,speed:20,bounciness:8}),
      Animated.timing(op,{toValue:1,duration:200,useNativeDriver:true}),
    ]).start(()=>{
      setTimeout(()=>{
        Animated.parallel([
          Animated.timing(ty,{toValue:100,duration:300,useNativeDriver:true}),
          Animated.timing(op,{toValue:0,duration:300,useNativeDriver:true}),
        ]).start(onHide);
      },2200);
    });
  },[]);
  if(!item) return null;
  return (
    <Animated.View style={[s.toast,{transform:[{translateY:ty}],opacity:op}]}>
      <Image source={{uri:item.img}} style={s.toastImg} resizeMode="cover"/>
      <View style={{flex:1}}>
        <Text style={s.toastTitle} numberOfLines={1}>{item.name}</Text>
        <Text style={s.toastSub}>✓ Adăugat în coș · {item.price} RON</Text>
      </View>
      <View style={s.toastCart}><Text style={{fontSize:18}}>🛒</Text></View>
    </Animated.View>
  );
}

// ─── Header ───────────────────────────────────────────────────────────
function Header({ onSearch, searchVal, onSearchChange, showSearch }) {
  return (
    <View style={s.headerWrap}>
      <View style={s.header}>
        <View>
          <Text style={s.logo}>Flex Shoes</Text>
          <Text style={s.logoSub}>ZONE · PIELE NATURALĂ</Text>
        </View>
        <PressScale onPress={onSearch}>
          <View style={[s.searchIconBtn, showSearch&&{backgroundColor:GL}]}>
            <Text style={{fontSize:19}}>🔍</Text>
          </View>
        </PressScale>
      </View>
      {showSearch&&(
        <FadeIn style={{paddingHorizontal:16,paddingBottom:10}}>
          <TextInput
            value={searchVal} onChangeText={onSearchChange}
            placeholder="Caută pantofi, ghete, accesorii..."
            style={s.searchInput} autoFocus returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </FadeIn>
      )}
    </View>
  );
}

// ─── Bottom Nav ───────────────────────────────────────────────────────
function NavTab({ icon, label, id, active, onPress, badge }) {
  const sv = useRef(new Animated.Value(1)).current;
  const go = ()=>{
    Animated.sequence([
      Animated.spring(sv,{toValue:0.78,useNativeDriver:true,speed:80}),
      Animated.spring(sv,{toValue:1,   useNativeDriver:true,speed:50,bounciness:18}),
    ]).start();
    onPress();
  };
  return (
    <Pressable onPress={go} style={s.navItem}>
      <Animated.View style={{alignItems:'center',transform:[{scale:sv}]}}>
        <View style={{position:'relative'}}>
          <Text style={[s.navIcon,active&&{fontSize:22}]}>{icon}</Text>
          {badge>0&&(
            <View style={[s.badge2,{backgroundColor:id==='favorites'?PINK:G}]}>
              <Text style={s.badge2Txt}>{badge>9?'9+':badge}</Text>
            </View>
          )}
        </View>
        <Text style={[s.navLbl,active&&{color:G,fontWeight:'800'}]}>{label}</Text>
        {active&&<View style={s.navLine}/>}
      </Animated.View>
    </Pressable>
  );
}

function BottomNav({ screen, setScreen, favCount, cartCount }) {
  const tabs = [
    {icon:'🏠',label:'Acasă',    id:'home'},
    {icon:'👟',label:'Produse',  id:'products'},
    {icon:'🛒',label:'Coș',      id:'cart',      badge:cartCount},
    {icon: favCount>0?'♥':'♡', label:'Favorite', id:'favorites', badge:favCount},
    {icon:'👤',label:'Cont',     id:'account'},
  ];
  const mainScreens = ['home','products','cart','favorites','account'];
  const activeTab = mainScreens.includes(screen) ? screen : null;
  return (
    <View style={s.nav}>
      {tabs.map(t=>(
        <NavTab key={t.id} {...t} active={activeTab===t.id} onPress={()=>setScreen(t.id)}/>
      ))}
    </View>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────
function ProdCard({ p, onPress, onAdd, favorites, toggleFav, index=0 }) {
  const [loaded,setLoaded] = useState(false);
  const imgOp = useRef(new Animated.Value(0)).current;
  const disc = p.oldPrice?Math.round((1-p.price/p.oldPrice)*100):null;
  const onLoad = ()=>{
    setLoaded(true);
    Animated.timing(imgOp,{toValue:1,duration:380,easing:Easing.out(Easing.ease),useNativeDriver:true}).start();
  };
  return (
    <FadeIn delay={index*50} style={{width:'48%'}}>
      <PressScale onPress={()=>onPress(p)}>
        <View style={s.card}>
          <View style={s.cardImg}>
            {!loaded&&<Shimmer style={StyleSheet.absoluteFill}/>}
            <Animated.Image source={{uri:p.img}} style={{width:'100%',height:'100%',opacity:imgOp}} resizeMode="cover" onLoad={onLoad}/>
            {p.badge&&<View style={[s.prodBadge,{backgroundColor:p.badge==='NOU'?G:RED}]}><Text style={s.prodBadgeTxt}>{p.badge}</Text></View>}
            {disc&&<View style={[s.prodBadge,{backgroundColor:RED,left:undefined,right:7}]}><Text style={s.prodBadgeTxt}>-{disc}%</Text></View>}
            <HeartBtn productId={p.id} favorites={favorites} toggleFav={toggleFav} size={16} style={s.cardHeart}/>
          </View>
          <View style={s.cardBody}>
            <Text style={s.cardSub}>{p.sub}</Text>
            <Text style={s.cardName} numberOfLines={2}>{p.name}</Text>
            <View style={{flexDirection:'row',alignItems:'center',gap:5,marginTop:3}}>
              <Text style={[s.cardPrice,p.oldPrice&&{color:RED}]}>{p.price} RON</Text>
              {p.oldPrice&&<Text style={s.cardOld}>{p.oldPrice} RON</Text>}
            </View>
            <Text style={[s.stockTxt,{color:p.stock===0?RED:p.stock<=2?'#B45309':G}]}>
              {p.stock===0?'Stoc epuizat':p.stock<=2?`Doar ${p.stock} buc.`:'În stoc'}
            </Text>
            <PressScale onPress={()=>p.stock>0&&onAdd(p)} sc={0.96}>
              <View style={[s.addBtn,p.stock===0&&{backgroundColor:'#C8C8C8'}]}>
                <Text style={s.addBtnTxt}>{p.stock===0?'EPUIZAT':'ADAUGĂ ÎN COȘ'}</Text>
              </View>
            </PressScale>
          </View>
        </View>
      </PressScale>
    </FadeIn>
  );
}

// ─── Home Screen ──────────────────────────────────────────────────────
function HomeScreen({ setScreen, setDetail, onAdd, favorites, toggleFav, products=[], productsLoading }) {
  const promoList = products.filter(p=>p.badge==='REDUCERE').slice(0,4);
  const newList   = products.filter(p=>p.badge==='NOU').slice(0,4);
  return (
    <ScrollView style={{flex:1}} contentContainerStyle={{paddingBottom:85}} showsVerticalScrollIndicator={false}>
      <View style={s.hero}>
        <FadeIn delay={0}><Text style={s.heroEyebrow}>PIELE NATURALĂ 100%</Text></FadeIn>
        <FadeIn delay={70}><Text style={s.heroTitle}>Încălțăminte{'\n'}de Calitate</Text></FadeIn>
        <FadeIn delay={140}><Text style={s.heroDesc}>Colecție permanentă · Livrare în 48h</Text></FadeIn>
        <FadeIn delay={200}>
          <View style={s.heroBenefits}>
            {[['🚚','500 RON'],['📏','Schimb'],['↩️','30 zile'],['⚡','48h']].map(([ic,t])=>(
              <View key={t} style={s.heroBenefit}>
                <Text style={{fontSize:14}}>{ic}</Text>
                <Text style={s.heroBenefitTxt}>{t}</Text>
              </View>
            ))}
          </View>
        </FadeIn>
        <FadeIn delay={260}>
          <PressScale onPress={()=>setScreen('products')}>
            <View style={s.heroBtn}><Text style={s.heroBtnTxt}>VEZI COLECȚIA →</Text></View>
          </PressScale>
        </FadeIn>
      </View>

      <View style={s.sectionWrap}>
        <Text style={s.sectionTitle}>CATEGORII</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{paddingHorizontal:16,paddingVertical:4,gap:10}}
          style={{marginHorizontal:-16}}>
          {CATEGORIES.filter(c=>c.id!=='all').map((c,i)=>(
            <FadeIn key={c.id} delay={i*45}>
              <PressScale onPress={()=>setScreen('products')}>
                <View style={s.catChip}>
                  <Text style={{fontSize:26}}>{c.icon}</Text>
                  <Text style={s.catChipTxt}>{c.label}</Text>
                </View>
              </PressScale>
            </FadeIn>
          ))}
        </ScrollView>
      </View>

      <View style={s.sectionWrap}>
        <View style={s.sectionRow}>
          <Text style={[s.sectionTitle,{marginBottom:0}]}>PROMOȚII</Text>
          <PressScale onPress={()=>setScreen('products')}><Text style={s.seeAll}>Vezi toate →</Text></PressScale>
        </View>
        {productsLoading ? (
          <View style={{padding:20,alignItems:'center'}}><ActivityIndicator color={G}/></View>
        ) : (
          <View style={s.grid}>
            {promoList.map((p,i)=>(
              <ProdCard key={p.id} p={p} index={i}
                onPress={pr=>{setDetail(pr);setScreen('detail');}}
                onAdd={onAdd} favorites={favorites} toggleFav={toggleFav}/>
            ))}
          </View>
        )}
      </View>

      <View style={s.sectionWrap}>
        <View style={s.sectionRow}>
          <Text style={[s.sectionTitle,{marginBottom:0}]}>NOUTĂȚI</Text>
          <PressScale onPress={()=>setScreen('products')}><Text style={s.seeAll}>Vezi toate →</Text></PressScale>
        </View>
        {productsLoading ? (
          <View style={{padding:20,alignItems:'center'}}><ActivityIndicator color={G}/></View>
        ) : (
          <View style={s.grid}>
            {newList.map((p,i)=>(
              <ProdCard key={p.id} p={p} index={i}
                onPress={pr=>{setDetail(pr);setScreen('detail');}}
                onAdd={onAdd} favorites={favorites} toggleFav={toggleFav}/>
            ))}
          </View>
        )}
      </View>

      <View style={s.aboutStrip}>
        <Text style={s.aboutTitle}>Flex Shoes Zone</Text>
        <Text style={s.aboutSub}>Încălțăminte din piele naturală 100% pentru femei, bărbați și copii.</Text>
        <Text style={s.aboutContact}>📍 Str. Baladei 5, Suceava  ·  📞 0742 766 548</Text>
        <Text style={s.aboutContact}>🌐 flex-shoes.ro  ·  L–V 9:00–18:00</Text>
      </View>
    </ScrollView>
  );
}

// ─── Products Screen ──────────────────────────────────────────────────
function ProductsScreen({ setScreen, setDetail, onAdd, search, favorites, toggleFav, products=[], productsLoading, loadMore, hasMore, loadingMore, onRefresh }) {
  const [activeCat, setActiveCat] = useState('all');
  const [activeSub, setActiveSub] = useState(null);
  const [sort, setSort] = useState('default');
  const cat = CATEGORIES.find(c=>c.id===activeCat);

  let list = products.filter(p=>(
    (activeCat==='all'||p.cat===activeCat)&&
    (!activeSub||p.sub===activeSub)&&
    p.name.toLowerCase().includes((search||'').toLowerCase())
  ));
  if(sort==='asc')  list=[...list].sort((a,b)=>a.price-b.price);
  if(sort==='desc') list=[...list].sort((a,b)=>b.price-a.price);

  return (
    <View style={{flex:1}}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{backgroundColor:W,borderBottomWidth:1,borderBottomColor:B,flexGrow:0}}
        contentContainerStyle={{paddingHorizontal:14,paddingVertical:10,gap:7}}>
        {CATEGORIES.map(c=>(
          <TouchableOpacity key={c.id} onPress={()=>{setActiveCat(c.id);setActiveSub(null);}} activeOpacity={0.7}>
            <View style={[s.filterChip,activeCat===c.id&&{backgroundColor:G,borderColor:G}]}>
              <Text style={[s.filterChipTxt,activeCat===c.id&&{color:W}]}>{c.icon} {c.label}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {cat?.subs&&(
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{backgroundColor:GL,borderBottomWidth:1,borderBottomColor:B,flexGrow:0}}
          contentContainerStyle={{paddingHorizontal:14,paddingVertical:8,gap:7}}>
          {cat.subs.map(sub=>(
            <PressScale key={sub} onPress={()=>setActiveSub(activeSub===sub?null:sub)}>
              <View style={[s.subChip,activeSub===sub&&{backgroundColor:GD,borderColor:GD}]}>
                <Text style={[s.subChipTxt,activeSub===sub&&{color:W}]}>{sub}</Text>
              </View>
            </PressScale>
          ))}
        </ScrollView>
      )}

      <View style={s.sortBar}>
        <Text style={s.countTxt}>{list.length} produse</Text>
        <View style={{flexDirection:'row',gap:7}}>
          {[['default','Sortare'],['asc','Preț ↑'],['desc','Preț ↓']].map(([v,l])=>(
            <PressScale key={v} onPress={()=>setSort(v)}>
              <View style={[s.sortBtn,sort===v&&{backgroundColor:G,borderColor:G}]}>
                <Text style={[s.sortBtnTxt,sort===v&&{color:W}]}>{l}</Text>
              </View>
            </PressScale>
          ))}
        </View>
      </View>

      {productsLoading ? (
        <View style={{flex:1,alignItems:'center',justifyContent:'center'}}>
          <ActivityIndicator size="large" color={G}/>
          <Text style={{color:GR,marginTop:12,fontSize:13}}>Se încarcă produsele...</Text>
        </View>
      ) : (
        <FlatList data={list} numColumns={2} keyExtractor={i=>String(i.id)}
          contentContainerStyle={{padding:12,paddingBottom:85,gap:10}}
          columnWrapperStyle={{gap:10}} showsVerticalScrollIndicator={false}
          onEndReached={loadMore} onEndReachedThreshold={0.4}
          onRefresh={onRefresh} refreshing={false}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={G} style={{marginVertical:16}}/> : null}
          renderItem={({item,index})=>(
            <ProdCard p={item} index={index}
              onPress={pr=>{setDetail(pr);setScreen('detail');}}
              onAdd={onAdd} favorites={favorites} toggleFav={toggleFav}/>
          )}
          ListEmptyComponent={
            <FadeIn><View style={{padding:40,alignItems:'center'}}>
              <Text style={{fontSize:38}}>😕</Text>
              <Text style={{color:GR,marginTop:8,fontSize:14}}>Niciun produs găsit</Text>
            </View></FadeIn>
          }
        />
      )}
    </View>
  );
}

// ─── Detail Screen ────────────────────────────────────────────────────
function DetailScreen({ product, onBack, onAdd, favorites, toggleFav, setDetail, products=[] }) {
  const [selSize,setSelSize]   = useState(null);
  const [selColor,setSelColor] = useState(product.colors[0]);
  const [qty,setQty]           = useState(1);
  const [added,setAdded]       = useState(false);
  const [loaded,setLoaded]     = useState(false);
  const imgOp = useRef(new Animated.Value(0)).current;
  const btnSc = useRef(new Animated.Value(1)).current;
  const disc  = product.oldPrice?Math.round((1-product.price/product.oldPrice)*100):null;

  const onLoad = ()=>{
    setLoaded(true);
    Animated.timing(imgOp,{toValue:1,duration:480,easing:Easing.out(Easing.ease),useNativeDriver:true}).start();
  };
  const handleAdd = ()=>{
    Animated.sequence([
      Animated.spring(btnSc,{toValue:0.94,useNativeDriver:true,speed:80}),
      Animated.spring(btnSc,{toValue:1,   useNativeDriver:true,speed:50,bounciness:12}),
    ]).start();
    onAdd({...product,selectedSize:selSize,selectedColor:selColor},qty);
    setAdded(true);
    setTimeout(()=>setAdded(false),2400);
  };
  const canAdd = product.stock>0&&(selSize||product.sizes.length===0);
  const btnLabel = product.stock===0?'STOC EPUIZAT':!canAdd?'ALEGE MĂRIMEA':added?'✓ ADĂUGAT ÎN COȘ!':`ADAUGĂ ÎN COȘ · ${product.price*qty} RON`;

  return (
    <ScrollView style={{flex:1}} contentContainerStyle={{paddingBottom:100}} showsVerticalScrollIndicator={false}>
      <View style={s.detailTopBar}>
        <PressScale onPress={onBack}><Text style={s.backTxt}>← Înapoi</Text></PressScale>
        <HeartBtn productId={product.id} favorites={favorites} toggleFav={toggleFav} size={22}/>
      </View>
      <View style={s.detailImg}>
        {!loaded&&<Shimmer style={StyleSheet.absoluteFill}/>}
        <Animated.Image source={{uri:product.img}} style={{width:'100%',height:'100%',opacity:imgOp}} resizeMode="cover" onLoad={onLoad}/>
        {product.badge&&<View style={[s.prodBadge,{backgroundColor:product.badge==='NOU'?G:RED,top:14,left:14}]}><Text style={s.prodBadgeTxt}>{product.badge}</Text></View>}
        {disc&&<View style={[s.prodBadge,{backgroundColor:RED,top:14,right:14,left:undefined}]}><Text style={s.prodBadgeTxt}>-{disc}%</Text></View>}
      </View>
      <View style={{padding:16}}>
        <FadeIn><Text style={s.detailBrand}>FLEX SHOES · PIELE NATURALĂ 100%</Text></FadeIn>
        <FadeIn delay={50}><Text style={s.detailName}>{product.name}</Text></FadeIn>
          {product.description&&<FadeIn delay={70}><Text style={{fontSize:13,color:'#666',lineHeight:20,marginBottom:12}}>{product.description}</Text></FadeIn>}
        <FadeIn delay={90}>
          <View style={{flexDirection:'row',alignItems:'baseline',gap:10,marginBottom:18}}>
            <Text style={[s.detailPrice,product.oldPrice&&{color:RED}]}>{product.price} RON</Text>
            {product.oldPrice&&<Text style={s.detailOld}>{product.oldPrice} RON</Text>}
          </View>
        </FadeIn>
        <FadeIn delay={130}>
          <Text style={s.optLabel}>Culoare: <Text style={{fontWeight:'400',color:GR}}>{selColor}</Text></Text>
          <View style={{flexDirection:'row',gap:8,flexWrap:'wrap',marginBottom:18}}>
            {product.colors.map(c=>(
              <PressScale key={c} onPress={()=>setSelColor(c)}>
                <View style={[s.optBtn,selColor===c&&{backgroundColor:G,borderColor:G}]}>
                  <Text style={[{fontSize:12,fontWeight:'600',color:BK},selColor===c&&{color:W}]}>{c}</Text>
                </View>
              </PressScale>
            ))}
          </View>
        </FadeIn>
        {product.sizes.length>0&&(
          <FadeIn delay={170}>
            <Text style={s.optLabel}>Mărime: {selSize?<Text style={{fontWeight:'400',color:GR}}>EU {selSize}</Text>:<Text style={{color:RED,fontWeight:'400'}}>selectează</Text>}</Text>
            <View style={{flexDirection:'row',gap:8,flexWrap:'wrap',marginBottom:18}}>
              {product.sizes.map(sz=>(
                <PressScale key={sz} onPress={()=>setSelSize(sz)}>
                  <View style={[s.sizeBtn,selSize===sz&&{backgroundColor:G,borderColor:G}]}>
                    <Text style={[{fontSize:13,fontWeight:'700',color:BK},selSize===sz&&{color:W}]}>{sz}</Text>
                  </View>
                </PressScale>
              ))}
            </View>
          </FadeIn>
        )}
        <FadeIn delay={210}>
          <View style={{flexDirection:'row',alignItems:'center',gap:14,marginBottom:20}}>
            <Text style={s.optLabel}>Cantitate</Text>
            <View style={s.qtyRow}>
              <PressScale onPress={()=>setQty(q=>Math.max(1,q-1))} style={s.qtyBtn}><Text style={s.qtyTxt}>−</Text></PressScale>
              <Text style={s.qtyVal}>{qty}</Text>
              <PressScale onPress={()=>setQty(q=>Math.min(product.stock,q+1))} style={s.qtyBtn}><Text style={s.qtyTxt}>+</Text></PressScale>
            </View>
          </View>
        </FadeIn>
        <FadeIn delay={250}>
          <Pressable onPress={handleAdd} disabled={!canAdd||product.stock===0}>
            <Animated.View style={[s.mainBtn,{transform:[{scale:btnSc}],backgroundColor:product.stock===0?'#C0C0C0':added?'#2D6A4F':G}]}>
              <Text style={s.mainBtnTxt}>{btnLabel}</Text>
            </Animated.View>
          </Pressable>
          <View style={[s.infoBox,{marginTop:14}]}>
            {['Piele naturală 100%','Schimb mărime gratuit','Retur 30 zile','Livrare în 48 ore'].map(t=>(
              <Text key={t} style={s.infoRow}>✓  {t}</Text>
            ))}
          </View>
        </FadeIn>

        {/* ── Produse similare ── */}
        {(()=>{
          const similar = products.filter(p=>
            p.id !== product.id && (p.cat === product.cat || p.sub === product.sub)
          ).slice(0,6);
          if(!similar.length) return null;
          return (
            <FadeIn delay={300}>
              <View style={{marginTop:24}}>
                <View style={s.sectionRow}>
                  <Text style={s.sectionTitle}>S-AR PUTEA SĂ ÎȚI PLACĂ</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{gap:12,paddingVertical:4,paddingRight:4}}
                  style={{marginHorizontal:-16,paddingLeft:16}}>
                  {similar.map((p,i)=>{
                    const [imgLoaded,setImgLoaded] = useState(false);
                    const op = useRef(new Animated.Value(0)).current;
                    return (
                      <TouchableOpacity key={p.id} activeOpacity={0.85}
                        onPress={()=>{ setDetail(p); }}>
                        <View style={s.simCard}>
                          <View style={s.simImg}>
                            {!imgLoaded&&<Shimmer style={StyleSheet.absoluteFill}/>}
                            <Animated.Image
                              source={{uri:p.img}}
                              style={{width:'100%',height:'100%',opacity:op}}
                              resizeMode="cover"
                              onLoad={()=>{setImgLoaded(true);Animated.timing(op,{toValue:1,duration:300,useNativeDriver:true}).start();}}
                            />
                            {p.badge&&<View style={[s.prodBadge,{backgroundColor:p.badge==='NOU'?G:RED}]}><Text style={s.prodBadgeTxt}>{p.badge}</Text></View>}
                            <HeartBtn productId={p.id} favorites={favorites} toggleFav={toggleFav} size={14} style={s.cardHeart}/>
                          </View>
                          <View style={{padding:8}}>
                            <Text style={s.cardSub}>{p.sub}</Text>
                            <Text style={s.simName} numberOfLines={2}>{p.name}</Text>
                            <Text style={[s.cardPrice,{fontSize:13},p.oldPrice&&{color:RED}]}>{p.price} RON</Text>
                            {p.oldPrice&&<Text style={[s.cardOld,{fontSize:10}]}>{p.oldPrice} RON</Text>}
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </FadeIn>
          );
        })()}
      </View>
    </ScrollView>
  );
}

// ─── Favorites Screen ─────────────────────────────────────────────────
function FavoritesScreen({ favorites, toggleFav, setScreen, setDetail, onAdd, products=[] }) {
  const favP = products.filter(p=>favorites.includes(p.id));
  if(!favP.length) return (
    <FadeIn style={{flex:1}}>
      <View style={s.emptyBox}>
        <Text style={{fontSize:56,marginBottom:12}}>♡</Text>
        <Text style={s.emptyTitle}>Nicio pereche salvată</Text>
        <Text style={s.emptySub}>Apasă ♡ pe orice produs pentru a-l salva</Text>
        <PressScale onPress={()=>setScreen('products')}>
          <View style={[s.mainBtn,{marginTop:22,paddingHorizontal:28}]}><Text style={s.mainBtnTxt}>EXPLOREAZĂ</Text></View>
        </PressScale>
      </View>
    </FadeIn>
  );
  return (
    <ScrollView style={{flex:1}} contentContainerStyle={{paddingBottom:85}} showsVerticalScrollIndicator={false}>
      <View style={{padding:16,paddingBottom:4,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
        <FadeIn><Text style={s.screenTitle}>Favorite ({favP.length})</Text></FadeIn>
      </View>
      <FlatList scrollEnabled={false} data={favP} numColumns={2} keyExtractor={i=>i.id.toString()}
        contentContainerStyle={{padding:12,gap:10}} columnWrapperStyle={{gap:10}}
        renderItem={({item,index})=>(
          <ProdCard p={item} index={index}
            onPress={pr=>{setDetail(pr);setScreen('detail');}}
            onAdd={onAdd} favorites={favorites} toggleFav={toggleFav}/>
        )}
      />
    </ScrollView>
  );
}

// ─── Cart Screen ──────────────────────────────────────────────────────
function CartScreen({ cart, setCart, setScreen }) {
  const total     = cart.reduce((s,i)=>s+i.price*i.qty,0);
  const transport = total>=500?0:25;
  const prog      = useRef(new Animated.Value(0)).current;
  useEffect(()=>{
    Animated.spring(prog,{toValue:Math.min(total/500,1),useNativeDriver:false,speed:12,bounciness:4}).start();
  },[total]);
  const upd=(id,d)=>setCart(c=>c.map(i=>i.cartId===id?{...i,qty:Math.max(1,i.qty+d)}:i));
  const del=(id)=>setCart(c=>c.filter(i=>i.cartId!==id));

  if(!cart.length) return (
    <FadeIn style={{flex:1}}>
      <View style={s.emptyBox}>
        <Text style={{fontSize:52,marginBottom:12}}>🛒</Text>
        <Text style={s.emptyTitle}>Coșul tău e gol</Text>
        <Text style={s.emptySub}>Adaugă produse pentru a continua</Text>
        <PressScale onPress={()=>setScreen('products')}>
          <View style={[s.mainBtn,{marginTop:22,paddingHorizontal:28}]}><Text style={s.mainBtnTxt}>EXPLOREAZĂ</Text></View>
        </PressScale>
      </View>
    </FadeIn>
  );
  return (
    <ScrollView style={{flex:1,padding:16}} contentContainerStyle={{paddingBottom:100}} showsVerticalScrollIndicator={false}>
      <FadeIn><Text style={[s.screenTitle,{marginBottom:12}]}>Coșul meu ({cart.length})</Text></FadeIn>
      {total<500&&(
        <FadeIn delay={40}>
          <View style={s.progressBox}>
            <View style={{flexDirection:'row',justifyContent:'space-between',marginBottom:7}}>
              <Text style={s.progressLbl}>🚚 Livrare gratuită de la <Text style={{fontWeight:'800'}}>500 RON</Text></Text>
              <Text style={s.progressLbl}><Text style={{fontWeight:'800'}}>{500-total} RON</Text> mai</Text>
            </View>
            <View style={s.progressTrack}>
              <Animated.View style={[s.progressFill,{width:prog.interpolate({inputRange:[0,1],outputRange:['0%','100%']})}]}/>
            </View>
          </View>
        </FadeIn>
      )}
      {cart.map((item,i)=>(
        <FadeIn key={item.cartId} delay={i*40}>
          <View style={s.cartRow}>
            <Image source={{uri:item.img}} style={s.cartThumb} resizeMode="cover"/>
            <View style={{flex:1}}>
              <Text style={s.cartItemName} numberOfLines={2}>{item.name}</Text>
              <Text style={s.cartItemMeta}>{item.selectedSize?`Mărime: ${item.selectedSize}`:''}{item.selectedColor?`  ·  ${item.selectedColor}`:''}</Text>
              <Text style={s.cartItemPrice}>{item.price*item.qty} RON</Text>
            </View>
            <View style={{alignItems:'center',gap:8}}>
              <View style={s.qtyRow}>
                <PressScale onPress={()=>upd(item.cartId,-1)} style={s.qtyBtn}><Text style={s.qtyTxt}>−</Text></PressScale>
                <Text style={s.qtyVal}>{item.qty}</Text>
                <PressScale onPress={()=>upd(item.cartId,1)} style={s.qtyBtn}><Text style={s.qtyTxt}>+</Text></PressScale>
              </View>
              <PressScale onPress={()=>del(item.cartId)}>
                <Text style={{color:RED,fontSize:11,fontWeight:'600'}}>Șterge</Text>
              </PressScale>
            </View>
          </View>
        </FadeIn>
      ))}
      <FadeIn delay={100}>
        <View style={s.totalCard}>
          {[['Subtotal',`${total} RON`],['Transport',transport===0?'GRATUIT':`${transport} RON`]].map(([l,v])=>(
            <View key={l} style={s.totalRow}>
              <Text style={s.totalLbl}>{l}</Text>
              <Text style={[s.totalVal,l==='Transport'&&transport===0&&{color:G}]}>{v}</Text>
            </View>
          ))}
          <View style={s.totalDivider}/>
          <View style={s.totalRow}>
            <Text style={{fontSize:16,fontWeight:'800',color:BK}}>Total</Text>
            <Text style={{fontSize:22,fontWeight:'900',color:BK}}>{total+transport} RON</Text>
          </View>
          <PressScale onPress={()=>setScreen('checkout')} sc={0.97} style={{marginTop:14}}>
            <View style={s.mainBtn}><Text style={s.mainBtnTxt}>FINALIZEAZĂ COMANDA →</Text></View>
          </PressScale>
        </View>
      </FadeIn>
    </ScrollView>
  );
}

// ─── CHECKOUT FLOW ────────────────────────────────────────────────────
// Step 1: Address
function CheckoutAddressStep({ onNext, savedAddresses }) {
  const [form, setForm] = useState({nume:'',telefon:'',adresa:'',oras:'',judet:'Suceava',cod:''});
  const [selSaved, setSelSaved] = useState(null);
  const upd = (k,v) => setForm(f=>({...f,[k]:v}));
  const valid = form.nume&&form.telefon&&form.adresa&&form.oras&&form.judet&&form.cod;

  return (
    <ScrollView contentContainerStyle={{padding:16,paddingBottom:40}} showsVerticalScrollIndicator={false}>
      <Text style={s.checkoutStepTitle}>📍 Adresă de livrare</Text>

      {savedAddresses.length>0&&(
        <View style={{marginBottom:16}}>
          <Text style={s.subSectionLbl}>ADRESE SALVATE</Text>
          {savedAddresses.map((a,i)=>(
            <PressScale key={i} onPress={()=>{setSelSaved(i);setForm(a);}}>
              <View style={[s.savedAddrCard, selSaved===i&&{borderColor:G,backgroundColor:GL}]}>
                <Text style={{fontSize:13,fontWeight:'700',color:BK}}>{a.nume}</Text>
                <Text style={{fontSize:11,color:GR,marginTop:2}}>{a.adresa}, {a.oras}, {a.judet}</Text>
              </View>
            </PressScale>
          ))}
          <View style={{height:1,backgroundColor:B,marginVertical:14}}/>
        </View>
      )}

      <Text style={s.subSectionLbl}>DATE LIVRARE</Text>
      {[['nume','Nume complet *'],['telefon','Telefon *'],['adresa','Adresă *'],['oras','Oraș *'],['cod','Cod poștal *']].map(([k,lbl])=>(
        <View key={k} style={{marginBottom:12}}>
          <Text style={s.inputLabel}>{lbl}</Text>
          <TextInput value={form[k]} onChangeText={v=>upd(k,v)} style={s.input} placeholder={lbl.replace(' *','')} placeholderTextColor="#BBB"/>
        </View>
      ))}
      <View style={{marginBottom:16}}>
        <Text style={s.inputLabel}>Județ *</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:7,paddingVertical:4}}>
          {JUDETE.map(j=>(
            <PressScale key={j} onPress={()=>upd('judet',j)}>
              <View style={[s.filterChip,form.judet===j&&{backgroundColor:G,borderColor:G}]}>
                <Text style={[s.filterChipTxt,form.judet===j&&{color:W}]}>{j}</Text>
              </View>
            </PressScale>
          ))}
        </ScrollView>
      </View>
      <PressScale onPress={()=>valid&&onNext(form)} sc={0.97}>
        <View style={[s.mainBtn,!valid&&{backgroundColor:'#C0C0C0'}]}>
          <Text style={s.mainBtnTxt}>CONTINUĂ →</Text>
        </View>
      </PressScale>
    </ScrollView>
  );
}

// Step 2: Shipping method
function CheckoutShippingStep({ onNext, onBack }) {
  const [sel, setSel] = useState('fan');
  const methods = [
    {id:'fan',  icon:'📦', label:'Fan Courier',  sub:'Livrare în 24–48 ore', price:25},
    {id:'dpd',  icon:'🚚', label:'DPD Romania',  sub:'Livrare în 24–72 ore', price:20},
    {id:'posta',icon:'📮', label:'Poșta Română', sub:'Livrare în 3–5 zile',  price:15},
  ];
  return (
    <ScrollView contentContainerStyle={{padding:16,paddingBottom:40}} showsVerticalScrollIndicator={false}>
      <Text style={s.checkoutStepTitle}>🚚 Metodă de livrare</Text>
      {methods.map((m,i)=>(
        <FadeIn key={m.id} delay={i*50}>
          <PressScale onPress={()=>setSel(m.id)}>
            <View style={[s.shippingCard, sel===m.id&&{borderColor:G,backgroundColor:GL}]}>
              <Text style={{fontSize:26,marginRight:12}}>{m.icon}</Text>
              <View style={{flex:1}}>
                <Text style={{fontSize:14,fontWeight:'700',color:BK}}>{m.label}</Text>
                <Text style={{fontSize:11,color:GR,marginTop:2}}>{m.sub}</Text>
              </View>
              <Text style={{fontSize:15,fontWeight:'800',color:G}}>{m.price} RON</Text>
              <View style={[s.radioOuter,sel===m.id&&{borderColor:G}]}>
                {sel===m.id&&<View style={s.radioInner}/>}
              </View>
            </View>
          </PressScale>
        </FadeIn>
      ))}
      <View style={{flexDirection:'row',gap:10,marginTop:8}}>
        <PressScale onPress={onBack} style={{flex:1}}>
          <View style={[s.mainBtn,{backgroundColor:L,borderWidth:1,borderColor:B}]}>
            <Text style={[s.mainBtnTxt,{color:BK}]}>← ÎNAPOI</Text>
          </View>
        </PressScale>
        <PressScale onPress={()=>onNext(methods.find(m=>m.id===sel))} style={{flex:2}}>
          <View style={s.mainBtn}><Text style={s.mainBtnTxt}>CONTINUĂ →</Text></View>
        </PressScale>
      </View>
    </ScrollView>
  );
}

// Step 3: Payment
function CheckoutPaymentStep({ onNext, onBack }) {
  const [sel, setSel] = useState('card');
  const methods = [
    {id:'card',   icon:'💳', label:'Card bancar',      sub:'Visa, Mastercard — plată securizată SSL'},
    {id:'ramburs',icon:'💵', label:'Ramburs la livrare',sub:'Plătești cash curierului'},
    {id:'online', icon:'📱', label:'Plată online',      sub:'Netopia Payments — securizat'},
  ];
  return (
    <ScrollView contentContainerStyle={{padding:16,paddingBottom:40}} showsVerticalScrollIndicator={false}>
      <Text style={s.checkoutStepTitle}>💳 Metodă de plată</Text>
      {methods.map((m,i)=>(
        <FadeIn key={m.id} delay={i*50}>
          <PressScale onPress={()=>setSel(m.id)}>
            <View style={[s.shippingCard, sel===m.id&&{borderColor:G,backgroundColor:GL}]}>
              <Text style={{fontSize:26,marginRight:12}}>{m.icon}</Text>
              <View style={{flex:1}}>
                <Text style={{fontSize:14,fontWeight:'700',color:BK}}>{m.label}</Text>
                <Text style={{fontSize:11,color:GR,marginTop:2}}>{m.sub}</Text>
              </View>
              <View style={[s.radioOuter,sel===m.id&&{borderColor:G}]}>
                {sel===m.id&&<View style={s.radioInner}/>}
              </View>
            </View>
          </PressScale>
        </FadeIn>
      ))}
      {sel==='card'&&(
        <FadeIn delay={160}>
          <View style={[s.infoBox,{marginTop:8}]}>
            <Text style={{fontSize:12,color:GD,fontWeight:'700',marginBottom:4}}>🔒 Plată securizată</Text>
            <Text style={{fontSize:11,color:GR}}>Vei fi redirecționat către terminalul de plată securizat Netopia. Datele cardului nu sunt stocate.</Text>
          </View>
        </FadeIn>
      )}
      <View style={{flexDirection:'row',gap:10,marginTop:12}}>
        <PressScale onPress={onBack} style={{flex:1}}>
          <View style={[s.mainBtn,{backgroundColor:L,borderWidth:1,borderColor:B}]}>
            <Text style={[s.mainBtnTxt,{color:BK}]}>← ÎNAPOI</Text>
          </View>
        </PressScale>
        <PressScale onPress={()=>onNext(methods.find(m=>m.id===sel))} style={{flex:2}}>
          <View style={s.mainBtn}><Text style={s.mainBtnTxt}>CONTINUĂ →</Text></View>
        </PressScale>
      </View>
    </ScrollView>
  );
}

// Step 4: Confirmation
function CheckoutConfirmStep({ cart, address, shipping, payment, onConfirm, onBack }) {
  const subtotal = cart.reduce((s,i)=>s+i.price*i.qty,0);
  const total    = subtotal + (shipping?.price||0);
  return (
    <ScrollView contentContainerStyle={{padding:16,paddingBottom:40}} showsVerticalScrollIndicator={false}>
      <Text style={s.checkoutStepTitle}>✅ Confirmă comanda</Text>

      <Text style={s.subSectionLbl}>PRODUSE ({cart.length})</Text>
      <View style={{backgroundColor:W,borderRadius:12,borderWidth:1,borderColor:B,marginBottom:14,overflow:'hidden'}}>
        {cart.map((item,i)=>(
          <View key={item.cartId} style={[{flexDirection:'row',padding:12,alignItems:'center',gap:10},i>0&&{borderTopWidth:1,borderTopColor:B}]}>
            <Image source={{uri:item.img}} style={{width:48,height:48,borderRadius:8}} resizeMode="cover"/>
            <View style={{flex:1}}>
              <Text style={{fontSize:12,fontWeight:'600',color:BK}} numberOfLines={1}>{item.name}</Text>
              <Text style={{fontSize:10,color:GR}}>x{item.qty}{item.selectedSize?` · EU ${item.selectedSize}`:''}</Text>
            </View>
            <Text style={{fontSize:13,fontWeight:'700',color:BK}}>{item.price*item.qty} RON</Text>
          </View>
        ))}
      </View>

      <Text style={s.subSectionLbl}>LIVRARE</Text>
      <View style={[s.infoBox,{marginBottom:14}]}>
        <Text style={{fontSize:13,fontWeight:'700',color:BK}}>{address?.nume}</Text>
        <Text style={{fontSize:12,color:GR,marginTop:3}}>{address?.adresa}, {address?.oras}, {address?.judet} {address?.cod}</Text>
        <Text style={{fontSize:12,color:GR,marginTop:1}}>📞 {address?.telefon}</Text>
        <Text style={{fontSize:12,color:G,marginTop:4,fontWeight:'600'}}>🚚 {shipping?.label} · {shipping?.price} RON</Text>
      </View>

      <Text style={s.subSectionLbl}>PLATĂ</Text>
      <View style={[s.infoBox,{marginBottom:14}]}>
        <Text style={{fontSize:13,fontWeight:'700',color:BK}}>{payment?.icon} {payment?.label}</Text>
      </View>

      <View style={s.totalCard}>
        {[['Subtotal',`${subtotal} RON`],['Transport',`${shipping?.price} RON`]].map(([l,v])=>(
          <View key={l} style={s.totalRow}>
            <Text style={s.totalLbl}>{l}</Text><Text style={s.totalVal}>{v}</Text>
          </View>
        ))}
        <View style={s.totalDivider}/>
        <View style={s.totalRow}>
          <Text style={{fontSize:15,fontWeight:'800',color:BK}}>Total</Text>
          <Text style={{fontSize:20,fontWeight:'900',color:BK}}>{total} RON</Text>
        </View>
      </View>

      <View style={{flexDirection:'row',gap:10,marginTop:14}}>
        <PressScale onPress={onBack} style={{flex:1}}>
          <View style={[s.mainBtn,{backgroundColor:L,borderWidth:1,borderColor:B}]}>
            <Text style={[s.mainBtnTxt,{color:BK}]}>← ÎNAPOI</Text>
          </View>
        </PressScale>
        <PressScale onPress={onConfirm} style={{flex:2}}>
          <View style={[s.mainBtn,{backgroundColor:GD}]}><Text style={s.mainBtnTxt}>PLASEAZĂ COMANDA ✓</Text></View>
        </PressScale>
      </View>
    </ScrollView>
  );
}

// Checkout container — manages steps
function CheckoutScreen({ cart, onBack, onOrderPlaced, savedAddresses }) {
  const [step, setStep]         = useState(1);
  const [address, setAddress]   = useState(null);
  const [shipping, setShipping] = useState(null);
  const [payment, setPayment]   = useState(null);

  const stepLabels = ['Adresă','Livrare','Plată','Confirmare'];

  return (
    <View style={{flex:1}}>
      {/* Progress bar */}
      <View style={s.checkoutProgress}>
        {stepLabels.map((l,i)=>(
          <View key={l} style={{alignItems:'center',flex:1}}>
            <View style={[s.checkoutDot,i<step&&{backgroundColor:G}]}>
              <Text style={{fontSize:10,fontWeight:'800',color:i<step?W:GR}}>{i+1}</Text>
            </View>
            <Text style={[{fontSize:9,marginTop:3,fontWeight:'600'},i<step?{color:G}:{color:GR}]}>{l}</Text>
          </View>
        ))}
        <View style={s.checkoutLine}/>
      </View>

      {step===1&&<CheckoutAddressStep onNext={a=>{setAddress(a);setStep(2);}} savedAddresses={savedAddresses}/>}
      {step===2&&<CheckoutShippingStep onNext={sh=>{setShipping(sh);setStep(3);}} onBack={()=>setStep(1)}/>}
      {step===3&&<CheckoutPaymentStep onNext={p=>{setPayment(p);setStep(4);}} onBack={()=>setStep(2)}/>}
      {step===4&&<CheckoutConfirmStep cart={cart} address={address} shipping={shipping} payment={payment}
        onConfirm={onOrderPlaced} onBack={()=>setStep(3)}/>}
    </View>
  );
}

// ─── Order Confirmed Screen ───────────────────────────────────────────
function OrderConfirmedScreen({ order, setScreen }) {
  const sc = useRef(new Animated.Value(0)).current;
  useEffect(()=>{
    Animated.spring(sc,{toValue:1,useNativeDriver:true,speed:8,bounciness:14}).start();
  },[]);
  return (
    <ScrollView contentContainerStyle={{flexGrow:1,alignItems:'center',justifyContent:'center',padding:24,paddingBottom:100}} showsVerticalScrollIndicator={false}>
      <Animated.Text style={{fontSize:72,transform:[{scale:sc}]}}>🎉</Animated.Text>
      <FadeIn delay={300}>
        <Text style={{fontSize:22,fontWeight:'900',color:BK,textAlign:'center',marginTop:16}}>Comandă plasată!</Text>
        <Text style={{fontSize:14,color:GR,textAlign:'center',marginTop:8,lineHeight:21}}>
          Îți mulțumim pentru comandă!{'\n'}Vei primi o confirmare pe email în câteva minute.
        </Text>
        <View style={[s.infoBox,{width:'100%',marginTop:20,marginBottom:8}]}>
          <Text style={{fontSize:11,color:GR,fontWeight:'700',marginBottom:6}}>DETALII COMANDĂ</Text>
          <Text style={{fontSize:12,color:BK}}>Număr comandă: <Text style={{fontWeight:'700',color:G}}>#{order.id}</Text></Text>
          <Text style={{fontSize:12,color:BK,marginTop:3}}>Total: <Text style={{fontWeight:'700'}}>{order.total} RON</Text></Text>
          <Text style={{fontSize:12,color:BK,marginTop:3}}>Livrare: <Text style={{fontWeight:'700'}}>{order.shipping?.label}</Text></Text>
          <Text style={{fontSize:12,color:BK,marginTop:3}}>Plată: <Text style={{fontWeight:'700'}}>{order.payment?.label}</Text></Text>
        </View>
        <Text style={{fontSize:12,color:GR,textAlign:'center',marginBottom:20}}>
          📦 Estimat: 24–48 ore lucrătoare
        </Text>
        <PressScale onPress={()=>setScreen('home')} style={{width:'100%'}}>
          <View style={s.mainBtn}><Text style={s.mainBtnTxt}>CONTINUĂ CUMPĂRĂTURILE</Text></View>
        </PressScale>
        <PressScale onPress={()=>setScreen('account')} style={{width:'100%',marginTop:10}}>
          <View style={[s.mainBtn,{backgroundColor:L,borderWidth:1,borderColor:B}]}>
            <Text style={[s.mainBtnTxt,{color:BK}]}>VEZI COMENZILE MELE</Text>
          </View>
        </PressScale>
      </FadeIn>
    </ScrollView>
  );
}

// ─── Sub-screen wrapper ────────────────────────────────────────────────
function SubScreen({ title, onBack, children }) {
  return (
    <View style={{flex:1,backgroundColor:L}}>
      <View style={s.subHeader}>
        <PressScale onPress={onBack}><Text style={s.backTxt}>← Înapoi</Text></PressScale>
        <Text style={s.subHeaderTitle}>{title}</Text>
        <View style={{width:60}}/>
      </View>
      <ScrollView contentContainerStyle={{padding:16,paddingBottom:100}} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </View>
  );
}

// ─── Account sub-screens ──────────────────────────────────────────────
function AddressesScreen({ onBack, addresses, setAddresses }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({nume:'',telefon:'',adresa:'',oras:'',judet:'Suceava',cod:''});
  const upd=(k,v)=>setForm(f=>({...f,[k]:v}));
  const save=()=>{
    if(form.nume&&form.adresa){
      setAddresses(a=>[...a,{...form}]);
      setForm({nume:'',telefon:'',adresa:'',oras:'',judet:'Suceava',cod:''});
      setShowForm(false);
    }
  };
  return (
    <SubScreen title="Adresele mele" onBack={onBack}>
      {addresses.map((a,i)=>(
        <FadeIn key={i} delay={i*40}>
          <View style={s.addrCard}>
            <View style={{flex:1}}>
              <Text style={{fontSize:14,fontWeight:'700',color:BK}}>{a.nume}</Text>
              <Text style={{fontSize:12,color:GR,marginTop:3}}>{a.adresa}</Text>
              <Text style={{fontSize:12,color:GR}}>{a.oras}, {a.judet} {a.cod}</Text>
              <Text style={{fontSize:12,color:GR}}>📞 {a.telefon}</Text>
            </View>
            <PressScale onPress={()=>setAddresses(ads=>ads.filter((_,j)=>j!==i))}>
              <Text style={{color:RED,fontSize:12,fontWeight:'600'}}>Șterge</Text>
            </PressScale>
          </View>
        </FadeIn>
      ))}
      {!showForm?(
        <PressScale onPress={()=>setShowForm(true)}>
          <View style={[s.mainBtn,{marginTop:4}]}><Text style={s.mainBtnTxt}>+ ADAUGĂ ADRESĂ</Text></View>
        </PressScale>
      ):(
        <FadeIn>
          <Text style={[s.subSectionLbl,{marginTop:8}]}>ADRESĂ NOUĂ</Text>
          {[['nume','Nume complet *'],['telefon','Telefon *'],['adresa','Adresă *'],['oras','Oraș *'],['cod','Cod poștal']].map(([k,lbl])=>(
            <View key={k} style={{marginBottom:10}}>
              <Text style={s.inputLabel}>{lbl}</Text>
              <TextInput value={form[k]} onChangeText={v=>upd(k,v)} style={s.input} placeholder={lbl.replace(' *','')} placeholderTextColor="#BBB"/>
            </View>
          ))}
          <Text style={s.inputLabel}>Județ</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:7,paddingVertical:4,marginBottom:14}}>
            {JUDETE.map(j=>(
              <PressScale key={j} onPress={()=>upd('judet',j)}>
                <View style={[s.filterChip,form.judet===j&&{backgroundColor:G,borderColor:G}]}>
                  <Text style={[s.filterChipTxt,form.judet===j&&{color:W}]}>{j}</Text>
                </View>
              </PressScale>
            ))}
          </ScrollView>
          <View style={{flexDirection:'row',gap:10}}>
            <PressScale onPress={()=>setShowForm(false)} style={{flex:1}}>
              <View style={[s.mainBtn,{backgroundColor:L,borderWidth:1,borderColor:B}]}>
                <Text style={[s.mainBtnTxt,{color:BK}]}>ANULEAZĂ</Text>
              </View>
            </PressScale>
            <PressScale onPress={save} style={{flex:2}}>
              <View style={s.mainBtn}><Text style={s.mainBtnTxt}>SALVEAZĂ ADRESA</Text></View>
            </PressScale>
          </View>
        </FadeIn>
      )}
    </SubScreen>
  );
}

function PaymentScreen({ onBack }) {
  return (
    <SubScreen title="Metode de plată" onBack={onBack}>
      <FadeIn>
        <Text style={s.subSectionLbl}>METODE DISPONIBILE</Text>
        {[
          {icon:'💳',title:'Card bancar',sub:'Visa, Mastercard, Maestro · Plată securizată SSL',badge:'RECOMANDAT'},
          {icon:'💵',title:'Ramburs la livrare',sub:'Plătești cash curierului la primirea coletului',badge:null},
          {icon:'📱',title:'Plată online',sub:'Procesată securizat prin Netopia Payments',badge:null},
        ].map((m,i)=>(
          <FadeIn key={m.title} delay={i*50}>
            <View style={s.payCard}>
              <Text style={{fontSize:28,marginRight:14}}>{m.icon}</Text>
              <View style={{flex:1}}>
                <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
                  <Text style={s.payTitle}>{m.title}</Text>
                  {m.badge&&<View style={{backgroundColor:GL,borderRadius:4,paddingHorizontal:6,paddingVertical:2}}><Text style={{fontSize:9,color:GD,fontWeight:'700'}}>{m.badge}</Text></View>}
                </View>
                <Text style={s.paySub}>{m.sub}</Text>
              </View>
            </View>
          </FadeIn>
        ))}
      </FadeIn>
      <FadeIn delay={180}>
        <View style={s.subInfoCard}>
          <Text style={s.subInfoTitle}>🔒  Plată 100% securizată</Text>
          <Text style={s.subInfoText}>Toate tranzacțiile sunt procesate prin conexiune criptată SSL.</Text>
        </View>
      </FadeIn>
    </SubScreen>
  );
}

function CouponsScreen({ onBack }) {
  const [code, setCode] = useState('');
  return (
    <SubScreen title="Cupoane & Vouchere" onBack={onBack}>
      <FadeIn>
        <Text style={s.subSectionLbl}>ADAUGĂ COD</Text>
        <View style={s.couponRow}>
          <TextInput value={code} onChangeText={setCode} style={s.couponInput} placeholder="ex: FLEX10" autoCapitalize="characters" placeholderTextColor="#BBB"/>
          <PressScale><View style={s.couponBtn}><Text style={s.mainBtnTxt}>APLICĂ</Text></View></PressScale>
        </View>
      </FadeIn>
      <FadeIn delay={60}>
        <Text style={[s.subSectionLbl,{marginTop:20}]}>CUPOANE ACTIVE</Text>
        <View style={s.subEmptyCard}>
          <Text style={{fontSize:36,marginBottom:10}}>🎟️</Text>
          <Text style={s.subEmptyTitle}>Niciun cupon activ</Text>
          <Text style={s.subEmptySub}>Înscrie-te la newsletter pentru cupoane exclusive</Text>
        </View>
      </FadeIn>
    </SubScreen>
  );
}

function SizeGuideScreen({ onBack }) {
  const sizes=[{eu:'35',uk:'2.5',us:'5',cm:'22.5'},{eu:'36',uk:'3.5',us:'6',cm:'23'},{eu:'37',uk:'4',us:'6.5',cm:'23.5'},{eu:'38',uk:'5',us:'7.5',cm:'24.5'},{eu:'39',uk:'6',us:'8',cm:'25'},{eu:'40',uk:'6.5',us:'8.5',cm:'25.5'},{eu:'41',uk:'7.5',us:'9.5',cm:'26'},{eu:'42',uk:'8',us:'10',cm:'26.5'},{eu:'43',uk:'9',us:'11',cm:'27.5'},{eu:'44',uk:'9.5',us:'11.5',cm:'28'},{eu:'45',uk:'10.5',us:'12.5',cm:'29'}];
  return (
    <SubScreen title="Ghid Mărimi" onBack={onBack}>
      <FadeIn>
        <View style={s.subInfoCard}>
          <Text style={s.subInfoTitle}>📏  Cum îți măsori piciorul</Text>
          <Text style={s.subInfoText}>1. Pune piciorul pe o coală de hârtie{'\n'}2. Trasează conturul cu un creion{'\n'}3. Măsoară distanța de la călcâi la degetul cel mai lung{'\n'}4. Compară cu tabelul de mai jos</Text>
        </View>
        <Text style={[s.subSectionLbl,{marginTop:12}]}>TABEL MĂRIMI</Text>
        <View style={{backgroundColor:W,borderRadius:12,overflow:'hidden',borderWidth:1,borderColor:B}}>
          <View style={[s.sizeRow2,{backgroundColor:G}]}>
            {['EU','UK','US','CM'].map(h=><Text key={h} style={[s.sizeCell2,{color:W,fontWeight:'800'}]}>{h}</Text>)}
          </View>
          {sizes.map((r,i)=>(
            <View key={r.eu} style={[s.sizeRow2,{backgroundColor:i%2===0?W:L}]}>
              <Text style={[s.sizeCell2,{fontWeight:'700',color:BK}]}>{r.eu}</Text>
              <Text style={[s.sizeCell2,{color:GR}]}>{r.uk}</Text>
              <Text style={[s.sizeCell2,{color:GR}]}>{r.us}</Text>
              <Text style={[s.sizeCell2,{color:G,fontWeight:'600'}]}>{r.cm}</Text>
            </View>
          ))}
        </View>
      </FadeIn>
    </SubScreen>
  );
}

function NotificationsScreen({ onBack }) {
  const [st, setSt] = useState({comenzi:true,promotii:true,noutati:false,newsletter:true});
  const items=[{key:'comenzi',label:'Statusul comenzilor',sub:'Confirmare, expediere, livrare'},{key:'promotii',label:'Promoții & Reduceri',sub:'Oferte speciale'},{key:'noutati',label:'Produse noi',sub:'Colecții noi'},{key:'newsletter',label:'Newsletter',sub:'Noutăți săptămânal'}];
  return (
    <SubScreen title="Notificări" onBack={onBack}>
      <FadeIn>
        <Text style={s.subSectionLbl}>PREFERINȚE</Text>
        <View style={{backgroundColor:W,borderRadius:12,borderWidth:1,borderColor:B,overflow:'hidden'}}>
          {items.map((item,i)=>(
            <View key={item.key}>
              <View style={s.notifRow}>
                <View style={{flex:1}}>
                  <Text style={s.notifLabel}>{item.label}</Text>
                  <Text style={s.notifSub}>{item.sub}</Text>
                </View>
                <Switch value={st[item.key]} onValueChange={v=>setSt(s=>({...s,[item.key]:v}))} trackColor={{false:B,true:G}} thumbColor={W}/>
              </View>
              {i<items.length-1&&<View style={s.accDivider}/>}
            </View>
          ))}
        </View>
      </FadeIn>
    </SubScreen>
  );
}

function ContactScreen({ onBack }) {
  return (
    <SubScreen title="Contact & Suport" onBack={onBack}>
      <FadeIn>
        {[{icon:'📞',label:'Telefon',val:'0742 766 548',sub:'L–V, 9:00–18:00'},{icon:'📧',label:'Email',val:'contact@flex-shoes.ro',sub:'Răspuns în max. 24 ore'},{icon:'🌐',label:'Website',val:'www.flex-shoes.ro',sub:'Magazin online complet'},{icon:'📘',label:'Facebook',val:'Flex Shoes Zone',sub:'Urmărește-ne'}].map((c,i)=>(
          <FadeIn key={c.label} delay={i*50}>
            <View style={s.contactCard}>
              <Text style={{fontSize:26,marginRight:14}}>{c.icon}</Text>
              <View style={{flex:1}}>
                <Text style={{fontSize:11,color:GR,fontWeight:'600',marginBottom:2}}>{c.label}</Text>
                <Text style={{fontSize:15,fontWeight:'700',color:BK}}>{c.val}</Text>
                <Text style={{fontSize:11,color:GR,marginTop:2}}>{c.sub}</Text>
              </View>
            </View>
          </FadeIn>
        ))}
      </FadeIn>
      <FadeIn delay={220}>
        <View style={s.subInfoCard}>
          <Text style={s.subInfoTitle}>⏰  Program</Text>
          <Text style={s.subInfoText}>L–V: 9:00–18:00  ·  Sâmbătă: 10:00–15:00  ·  Duminică: Închis</Text>
        </View>
      </FadeIn>
    </SubScreen>
  );
}

function StoreLocationScreen({ onBack }) {
  return (
    <SubScreen title="Locație Magazin" onBack={onBack}>
      <FadeIn>
        <View style={s.mapPlaceholder}>
          <Text style={{fontSize:48}}>🗺️</Text>
          <Text style={{fontSize:14,fontWeight:'700',color:BK,marginTop:12}}>Flex Shoes Zone</Text>
          <Text style={{fontSize:12,color:GR,marginTop:4}}>Str. Baladei 5, Suceava</Text>
        </View>
        <View style={s.subInfoCard}>
          <Text style={s.subInfoTitle}>📍  Adresă</Text>
          <Text style={s.subInfoText}>Str. Baladei nr. 5, Suceava, România</Text>
        </View>
        <View style={[s.subInfoCard,{marginTop:8}]}>
          <Text style={s.subInfoTitle}>⏰  Program</Text>
          <Text style={s.subInfoText}>L–V: 9:00–18:00  ·  Sâmbătă: 10:00–15:00</Text>
        </View>
         <PressScale onPress={() => Linking.openURL('https://maps.google.com/?q=Str.+Baladei+5,+Suceava,+Romania')} style={{marginTop:12}}>
          <View style={s.mainBtn}><Text style={s.mainBtnTxt}>🗺 DESCHIDE ÎN MAPS</Text></View>
        </PressScale>
      </FadeIn>
    </SubScreen>
  );
}

function LegalScreen({ title, onBack, content }) {
  return (
    <SubScreen title={title} onBack={onBack}>
      <FadeIn>
        <View style={{backgroundColor:W,borderRadius:12,padding:16,borderWidth:1,borderColor:B}}>
          <Text style={{fontSize:13,color:GR,lineHeight:22}}>{content}</Text>
        </View>
      </FadeIn>
    </SubScreen>
  );
}

const LEGAL = {
  termeni:`SC FLEX SHOES ZONE SRL\nStr. Baladei 5, Suceava\n\nPrin utilizarea acestei aplicații acceptați termenii și condițiile de utilizare.\n\nProdusele sunt fabricate din piele naturală 100%. Prețurile includ TVA. Comenzile se procesează în 24–48 ore lucrătoare.\n\nFlex Shoes Zone își rezervă dreptul de a modifica prețurile fără notificare prealabilă.`,
  confidentialitate:`Flex Shoes Zone respectă GDPR și legislația română privind protecția datelor.\n\nDate colectate: nume, email, adresă, telefon — exclusiv pentru procesarea comenzilor.\n\nNu vindem și nu partajăm datele cu terțe părți în scopuri comerciale.\n\nPoți solicita ștergerea datelor la contact@flex-shoes.ro.`,
  retur:`✓ Retur în 30 zile de la primire\n✓ Schimb de mărime GRATUIT\n✓ Produsele trebuie în starea originală\n\nProcedura:\n1. Contactează-ne la 0742 766 548\n2. Primești eticheta de retur\n3. Trimiți produsul\n4. Restituire în 5–7 zile lucrătoare`,
};

// ─── Account Screen ───────────────────────────────────────────────────
function MenuRow({ icon, label, sub, onPress, accent }) {
  return (
    <PressScale onPress={onPress}>
      <View style={[s.accMenuRow,accent&&{backgroundColor:accent+'10',borderColor:accent+'30'}]}>
        <View style={[s.accMenuIcon,accent&&{backgroundColor:accent+'15'}]}>
          <Text style={{fontSize:18}}>{icon}</Text>
        </View>
        <View style={{flex:1}}>
          <Text style={[s.accMenuLabel,accent&&{color:accent}]}>{label}</Text>
          {sub&&<Text style={s.accMenuSub}>{sub}</Text>}
        </View>
        <Text style={s.accMenuArrow}>›</Text>
      </View>
    </PressScale>
  );
}

function AccountScreen({ favorites, setScreen, addresses, orders=[], profileName, profileEmail }) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [email,    setEmail]    = useState('');
  const [pass,     setPass]     = useState('');
  const [name,     setName]     = useState('');
  const [isReg,    setIsReg]    = useState(false);
  const points = 150;

  useEffect(()=>{
    AsyncStorage.getItem('fs_user').then(val=>{
      if(val){ const u=JSON.parse(val); setLoggedIn(true); setEmail(u.email||''); setName(u.name||''); }
      setLoading(false);
    }).catch(()=>setLoading(false));
  },[]);

  const login = async ()=>{
    if(!email||!pass) return;
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if(!emailValid) { alert('Introdu un email valid!'); return; }
    const u={email,name:name||email.split('@')[0]};
    await AsyncStorage.setItem('fs_user',JSON.stringify(u));
    setName(u.name); setLoggedIn(true);
  };

  const register = async ()=>{
    if(!email||!pass||!name) return;
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if(!emailValid) { alert('Introdu un email valid!'); return; }
    const u={email,name};
    await AsyncStorage.setItem('fs_user',JSON.stringify(u));
    setLoggedIn(true);
  };

  const logout = async ()=>{
    await AsyncStorage.removeItem('fs_user');
    setLoggedIn(false); setEmail(''); setPass(''); setName('');
  };

  if(loading) return (
    <View style={{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:L}}>
      <Shimmer style={{width:72,height:72,borderRadius:36,marginBottom:16}}/>
      <Shimmer style={{width:160,height:14,borderRadius:7,marginBottom:8}}/>
    </View>
  );

  if(!loggedIn) return (
    <ScrollView style={{flex:1,backgroundColor:L}} contentContainerStyle={{flexGrow:1,justifyContent:'center',padding:24,paddingBottom:100}} showsVerticalScrollIndicator={false}>
      <FadeIn>
        <View style={{alignItems:'center',marginBottom:28}}>
          <Text style={{fontSize:22,fontWeight:'900',color:G,fontStyle:'italic',marginBottom:4}}>Flex Shoes</Text>
          <Text style={{fontSize:14,fontWeight:'800',color:BK}}>{isReg?'Creează cont nou':'Bun venit înapoi'}</Text>
          <Text style={{fontSize:12,color:GR,marginTop:4}}>{isReg?'Completează datele de mai jos':'Conectează-te la contul tău'}</Text>
        </View>
      </FadeIn>
      <FadeIn delay={80}>
        <View style={s.accLoginCard}>
          {isReg&&(
            <View style={{marginBottom:12}}>
              <Text style={s.inputLabel}>Nume complet *</Text>
              <TextInput value={name} onChangeText={setName} style={s.input} placeholder="Ion Popescu" placeholderTextColor="#BBB"/>
            </View>
          )}
          <Text style={s.inputLabel}>Email *</Text>
          <TextInput value={email} onChangeText={setEmail} style={[s.input,{marginBottom:12}]} placeholder="email@exemplu.ro" keyboardType="email-address" autoCapitalize="none" placeholderTextColor="#BBB"/>
          <Text style={s.inputLabel}>Parolă *</Text>
          <TextInput value={pass} onChangeText={setPass} style={s.input} placeholder="••••••••" secureTextEntry placeholderTextColor="#BBB"/>
          {!isReg&&(
            <TouchableOpacity style={{alignSelf:'flex-end',marginBottom:16,marginTop:4}}>
              <Text style={{color:G,fontSize:12,fontWeight:'600'}}>Ai uitat parola?</Text>
            </TouchableOpacity>
          )}
          <PressScale onPress={isReg?register:login} sc={0.97} style={{marginTop:isReg?14:0}}>
            <View style={s.mainBtn}><Text style={s.mainBtnTxt}>{isReg?'CREEAZĂ CONT':'CONECTEAZĂ-TE'}</Text></View>
          </PressScale>
        </View>
      </FadeIn>
      <FadeIn delay={160}>
        <View style={{flexDirection:'row',alignItems:'center',marginVertical:16}}>
          <View style={{flex:1,height:1,backgroundColor:B}}/>
          <Text style={{color:GR,fontSize:12,marginHorizontal:12}}>sau</Text>
          <View style={{flex:1,height:1,backgroundColor:B}}/>
        </View>
        <PressScale onPress={()=>setIsReg(!isReg)} sc={0.97}>
          <View style={[s.mainBtn,{backgroundColor:W,borderWidth:1.5,borderColor:G}]}>
            <Text style={[s.mainBtnTxt,{color:G}]}>{isReg?'AM DEJA CONT':'CREEAZĂ CONT NOU'}</Text>
          </View>
        </PressScale>
      </FadeIn>
    </ScrollView>
  );

  const initials = (name||email||'U').charAt(0).toUpperCase();
  const discount = Math.floor(points/100)*5;

  return (
    <ScrollView style={{flex:1,backgroundColor:L}} contentContainerStyle={{paddingBottom:90}} showsVerticalScrollIndicator={false}>
      <FadeIn>
        <View style={s.accProfileHeader}>
          <View style={s.accAvatar}><Text style={s.accAvatarTxt}>{initials}</Text></View>
          <View style={{flex:1}}>
            <Text style={s.accName}>{name||email}</Text>
            <Text style={s.accEmail}>{email}</Text>
          </View>
          <PressScale onPress={()=>setScreen('editprofile')}><View style={s.accEditBtn}><Text style={{fontSize:13,color:G,fontWeight:'600'}}>Editează</Text></View></PressScale>
        </View>
      </FadeIn>

      <FadeIn delay={60}>
        <View style={s.accOrdersCard}>
          <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
            <Text style={s.accCardTitle}>Comenzile mele</Text>
            <TouchableOpacity onPress={()=>{setScreen('orders');}} activeOpacity={0.7}>
              <Text style={{color:G,fontSize:12,fontWeight:'700'}}>Vezi toate →</Text>
            </TouchableOpacity>
          </View>
          <View style={{flexDirection:'row',justifyContent:'space-around'}}>
            {[
              ['📦','În procesare','procesare'],
              ['🚚','Expediate',   'expediat'],
              ['✅','Livrate',     'livrat'],
              ['↩️','Returnate',  'returnat'],
            ].map(([ic,lbl,status])=>{
              const cnt = status==='procesare'
                ? orders.filter(o=>o.status==='procesare').length
                : orders.filter(o=>o.status===status).length;
              return (
                <TouchableOpacity key={lbl} activeOpacity={0.7}
                  onPress={()=>{ setScreen('orders'); }}>
                  <View style={{alignItems:'center',gap:6}}>
                    <View style={s.accOrderIcon}>
                      <Text style={{fontSize:20}}>{ic}</Text>
                      {cnt>0&&<View style={s.accOrderBadge}><Text style={s.accOrderBadgeTxt}>{cnt}</Text></View>}
                    </View>
                    <Text style={{fontSize:10,color:GR,fontWeight:'600',textAlign:'center',width:60}}>{lbl}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </FadeIn>

      <FadeIn delay={100}>
        <View style={s.accLoyaltyCard}>
          <View style={{flexDirection:'row',alignItems:'center',marginBottom:12}}>
            <Text style={{fontSize:22,marginRight:10}}>🏆</Text>
            <View style={{flex:1}}>
              <Text style={s.accCardTitle}>Program Fidelitate</Text>
              <Text style={{fontSize:11,color:GR,marginTop:1}}>Acumulează puncte la fiecare comandă</Text>
            </View>
          </View>
          <View style={{flexDirection:'row',gap:10}}>
            <View style={s.accStatBox}><Text style={s.accStatVal}>{points}</Text><Text style={s.accStatLbl}>Puncte</Text></View>
            <View style={s.accStatBox}><Text style={[s.accStatVal,{color:G}]}>{discount} RON</Text><Text style={s.accStatLbl}>Reducere</Text></View>
          </View>
          <View style={{marginTop:12}}>
            <View style={{flexDirection:'row',justifyContent:'space-between',marginBottom:5}}>
              <Text style={{fontSize:11,color:GR}}>Spre următoarea reducere</Text>
              <Text style={{fontSize:11,color:G,fontWeight:'700'}}>{points%100}/100 pct</Text>
            </View>
            <View style={{height:5,backgroundColor:B,borderRadius:3}}>
              <View style={{height:'100%',width:`${points%100}%`,backgroundColor:G,borderRadius:3}}/>
            </View>
          </View>
        </View>
      </FadeIn>

      <FadeIn delay={130}>
        <Text style={s.accSectionHeader}>CONTUL MEU</Text>
        <View style={s.accCard}>
          <MenuRow icon="♥" label="Favorite" sub={`${favorites.length} produse salvate`} onPress={()=>setScreen('favorites')} accent={PINK}/>
          <View style={s.accDivider}/>
          <MenuRow icon="📍" label="Adresele mele" sub={`${addresses.length} adrese salvate`} onPress={()=>setScreen('addresses')}/>
          <View style={s.accDivider}/>
          <MenuRow icon="💳" label="Metode de plată" sub="Card, ramburs, online" onPress={()=>setScreen('payment')}/>
          <View style={s.accDivider}/>
          <MenuRow icon="🎟️" label="Cupoane & Vouchere" sub="Coduri de reducere" onPress={()=>setScreen('coupons')}/>
        </View>
      </FadeIn>

      <FadeIn delay={160}>
        <Text style={s.accSectionHeader}>CUMPĂRĂTURI</Text>
        <View style={s.accCard}>
          <MenuRow icon="📏" label="Ghid Mărimi" sub="Tabel EU/UK/US/CM" onPress={()=>setScreen('sizeguide')}/>
          <View style={s.accDivider}/>
          <MenuRow icon="🔔" label="Notificări" sub="Promoții, noutăți, comenzi" onPress={()=>setScreen('notifications')}/>
        </View>
      </FadeIn>

      <FadeIn delay={190}>
        <Text style={s.accSectionHeader}>SUPORT</Text>
        <View style={s.accCard}>
          <MenuRow icon="📞" label="Contact & Suport" sub="0742 766 548  ·  L–V 9–18" onPress={()=>setScreen('contact')}/>
          <View style={s.accDivider}/>
          <MenuRow icon="📍" label="Locație Magazin" sub="Str. Baladei 5, Suceava" onPress={()=>setScreen('storelocation')}/>
        </View>
      </FadeIn>

      <FadeIn delay={220}>
        <Text style={s.accSectionHeader}>LEGAL</Text>
        <View style={s.accCard}>
          <MenuRow icon="📄" label="Termeni și Condiții" onPress={()=>setScreen('termeni')}/>
          <View style={s.accDivider}/>
          <MenuRow icon="🔒" label="Politica de Confidențialitate" onPress={()=>setScreen('confidentialitate')}/>
          <View style={s.accDivider}/>
          <MenuRow icon="↩️" label="Politica de Retur" sub="30 zile · Schimb gratuit" onPress={()=>setScreen('retur')}/>
        </View>
      </FadeIn>

      <FadeIn delay={250}>
        <View style={{paddingHorizontal:16,marginTop:8,marginBottom:24}}>
          <PressScale onPress={logout} sc={0.97}>
            <View style={s.accLogoutBtn}>
              <Text style={{fontSize:16,marginRight:8}}>↩</Text>
              <Text style={s.accLogoutTxt}>Deconectează-te</Text>
            </View>
          </PressScale>
          <Text style={{textAlign:'center',color:GR,fontSize:10,marginTop:16}}>Flex Shoes Zone · flex-shoes.ro · v1.0</Text>
        </View>
      </FadeIn>
    </ScrollView>
  );
}

// ─── Orders Screen ────────────────────────────────────────────────────
 const MOCK_ORDERS = [];
const STATUS_CONFIG = {
  procesare: { label:'În procesare', icon:'📦', color:'#B45309', bg:'#FEF3C7' },
  expediat:  { label:'Expediat',     icon:'🚚', color:'#1D4ED8', bg:'#EFF6FF' },
  livrat:    { label:'Livrat',        icon:'✅', color:'#15803D', bg:'#F0FDF4' },
  returnat:  { label:'Returnat',      icon:'↩️', color:'#9333EA', bg:'#FAF5FF' },
};

function OrdersScreen({ onBack, orders, filterStatus }) {
  const [activeTab, setActiveTab] = useState(filterStatus||'all');
  const tabs = [
    {id:'all',       label:'Toate',        count: orders.length},
    {id:'procesare', label:'Active',        count: orders.filter(o=>o.status==='procesare'||o.status==='expediat').length},
    {id:'livrat',    label:'Livrate',       count: orders.filter(o=>o.status==='livrat').length},
    {id:'returnat',  label:'Returnate',     count: orders.filter(o=>o.status==='returnat').length},
  ];
  const filtered = activeTab==='all' ? orders
    : activeTab==='procesare' ? orders.filter(o=>o.status==='procesare'||o.status==='expediat')
    : orders.filter(o=>o.status===activeTab);

  return (
    <SubScreen title="Comenzile mele" onBack={onBack}>
      {/* Tab bar */}
      <View style={{flexDirection:'row',backgroundColor:W,borderRadius:12,padding:4,marginBottom:16,borderWidth:1,borderColor:B}}>
        {tabs.map(t=>(
          <TouchableOpacity key={t.id} onPress={()=>setActiveTab(t.id)} style={{flex:1,alignItems:'center'}} activeOpacity={0.7}>
            <View style={[{paddingVertical:8,paddingHorizontal:4,borderRadius:9,alignItems:'center',width:'100%'},activeTab===t.id&&{backgroundColor:G}]}>
              <Text style={[{fontSize:11,fontWeight:'700'},activeTab===t.id?{color:W}:{color:GR}]}>{t.label}</Text>
              {t.count>0&&<Text style={[{fontSize:10,fontWeight:'800'},activeTab===t.id?{color:'rgba(255,255,255,0.8)'}:{color:GR}]}>{t.count}</Text>}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {filtered.length===0?(
        <FadeIn>
          <View style={s.subEmptyCard}>
            <Text style={{fontSize:40,marginBottom:10}}>📋</Text>
            <Text style={s.subEmptyTitle}>Nicio comandă</Text>
            <Text style={s.subEmptySub}>Nu ai comenzi în această categorie</Text>
          </View>
        </FadeIn>
      ):(
        filtered.map((order,i)=>{
          const st = STATUS_CONFIG[order.status]||STATUS_CONFIG.livrat;
          return (
            <FadeIn key={order.id} delay={i*50}>
              <View style={s.orderCard}>
                <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <Text style={{fontSize:13,fontWeight:'800',color:BK}}>Comanda #{order.id}</Text>
                  <View style={[s.statusBadge,{backgroundColor:st.bg}]}>
                    <Text style={{fontSize:10,fontWeight:'700',color:st.color}}>{st.icon} {st.label}</Text>
                  </View>
                </View>
                <Text style={{fontSize:11,color:GR,marginBottom:6}}>📅 {order.date}  ·  🚚 {order.shipping}</Text>
                {order.items.map((item,j)=>(
                  <Text key={j} style={{fontSize:12,color:BK,marginBottom:2}}>• {item}</Text>
                ))}
                <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:10,paddingTop:10,borderTopWidth:1,borderTopColor:B}}>
                  <Text style={{fontSize:13,fontWeight:'900',color:BK}}>Total: {order.total} RON</Text>
                  <TouchableOpacity activeOpacity={0.7}>
                    <Text style={{fontSize:12,color:G,fontWeight:'700'}}>Detalii →</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </FadeIn>
          );
        })
      )}
    </SubScreen>
  );
}

// ─── Edit Profile Screen ──────────────────────────────────────────────
function EditProfileScreen({ onBack, currentName, currentEmail, onSave }) {
  const [name,  setName]  = useState(currentName||'');
  const [email, setEmail] = useState(currentEmail||'');
  const [phone, setPhone] = useState('');
  const [saved, setSaved] = useState(false);

  const save = async ()=>{
    const u = {name,email};
    await AsyncStorage.setItem('fs_user', JSON.stringify(u));
    onSave(name, email);
    setSaved(true);
    setTimeout(()=>onBack(), 1200);
  };

  return (
    <SubScreen title="Editează profil" onBack={onBack}>
      <FadeIn>
        <View style={{alignItems:'center',marginBottom:24}}>
          <View style={[s.accAvatar,{width:72,height:72,borderRadius:36}]}>
            <Text style={[s.accAvatarTxt,{fontSize:28}]}>{(name||email||'U').charAt(0).toUpperCase()}</Text>
          </View>
        </View>
        <Text style={s.subSectionLbl}>DATE PERSONALE</Text>
        <View style={{marginBottom:12}}>
          <Text style={s.inputLabel}>Nume complet</Text>
          <TextInput value={name} onChangeText={setName} style={s.input} placeholder="Ion Popescu" placeholderTextColor="#BBB"/>
        </View>
        <View style={{marginBottom:12}}>
          <Text style={s.inputLabel}>Email</Text>
          <TextInput value={email} onChangeText={setEmail} style={s.input} placeholder="email@exemplu.ro" keyboardType="email-address" autoCapitalize="none" placeholderTextColor="#BBB"/>
        </View>
        <View style={{marginBottom:20}}>
          <Text style={s.inputLabel}>Telefon</Text>
          <TextInput value={phone} onChangeText={setPhone} style={s.input} placeholder="07xx xxx xxx" keyboardType="phone-pad" placeholderTextColor="#BBB"/>
        </View>
        <PressScale onPress={save} sc={0.97}>
          <View style={[s.mainBtn,saved&&{backgroundColor:'#2D6A4F'}]}>
            <Text style={s.mainBtnTxt}>{saved?'✓ SALVAT!':'SALVEAZĂ MODIFICĂRILE'}</Text>
          </View>
        </PressScale>
      </FadeIn>
    </SubScreen>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────
export default function App() {
  const [screen,    setScreen]    = useState('home');
  const [cart,      setCart]      = useState([]);
  const [favs,      setFavs]      = useState([]);
  const [detail,    setDetail]    = useState(null);
  const [search,    setSearch]    = useState('');
  const [showSrch,  setShowSrch]  = useState(false);
  const [toast,     setToast]     = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [lastOrder, setLastOrder] = useState(null);
  const [orders,    setOrders]    = useState(MOCK_ORDERS);
  const [orderFilter, setOrderFilter] = useState('all');
  const [profileName,  setProfileName]  = useState('');
  const [profileEmail, setProfileEmail] = useState('');

  // ── Gomag API ──
  const { products, loading: productsLoading, apiOnline, loadMore, hasMore, loadingMore, refresh } = useProducts();

  const addToCart = (product, qty=1)=>{
    setCart(c=>{
      const id=`${product.id}-${product.selectedSize}-${product.selectedColor}`;
      const ex=c.find(i=>i.cartId===id);
      if(ex) return c.map(i=>i.cartId===id?{...i,qty:i.qty+qty}:i);
      return [...c,{...product,qty,cartId:id}];
    });
    setToast(product);
  };

  const toggleFav = id=>setFavs(f=>f.includes(id)?f.filter(x=>x!==id):[...f,id]);
  const cartCount = cart.reduce((s,i)=>s+i.qty,0);
  const favCount  = favs.length;
  const nav       = sc=>setScreen(sc);

  const onOrderPlaced = (orderData)=>{
    const order = {
      id: String(Math.floor(Math.random()*90000)+10000),
      date: new Date().toLocaleDateString('ro-RO',{day:'2-digit',month:'short',year:'numeric'}),
      status: 'procesare',
      items: cart.map(i=>i.name),
      total: cart.reduce((s,i)=>s+i.price*i.qty,0)+(orderData?.shipping?.price||0),
      shipping: orderData?.shipping?.label||'Fan Courier',
      ...orderData,
    };
    setOrders(prev=>[order,...prev]);
    setLastOrder(order);
    setCart([]);
    setScreen('orderconfirmed');
  };

  const props = {setScreen:nav,setDetail,onAdd:addToCart,favorites:favs,toggleFav,products,productsLoading};

  const renderScreen = ()=>{
    if(screen==='detail'&&detail)   return <DetailScreen product={detail} onBack={()=>setScreen('products')} onAdd={(p,q)=>addToCart(p,q)} favorites={favs} toggleFav={toggleFav} setDetail={setDetail} products={products}/>;
    if(screen==='home')             return <HomeScreen {...props}/>;
    if(screen==='products')         return <ProductsScreen {...props} search={search} loadMore={loadMore} hasMore={hasMore} loadingMore={loadingMore} onRefresh={refresh}/>;
    if(screen==='cart')             return <CartScreen cart={cart} setCart={setCart} setScreen={nav}/>;
    if(screen==='checkout')         return <CheckoutScreen cart={cart} onBack={()=>nav('cart')} onOrderPlaced={onOrderPlaced} savedAddresses={addresses}/>;
    if(screen==='orderconfirmed')   return <OrderConfirmedScreen order={lastOrder||{}} setScreen={nav}/>;
    if(screen==='favorites')        return <FavoritesScreen {...props}/>;
    if(screen==='account')          return <AccountScreen favorites={favs} setScreen={nav} addresses={addresses} orders={orders} profileName={profileName} profileEmail={profileEmail}/>;
    if(screen==='addresses')        return <AddressesScreen onBack={()=>nav('account')} addresses={addresses} setAddresses={setAddresses}/>;
    if(screen==='payment')          return <PaymentScreen onBack={()=>nav('account')}/>;
    if(screen==='coupons')          return <CouponsScreen onBack={()=>nav('account')}/>;
    if(screen==='sizeguide')        return <SizeGuideScreen onBack={()=>nav('account')}/>;
    if(screen==='notifications')    return <NotificationsScreen onBack={()=>nav('account')}/>;
    if(screen==='contact')          return <ContactScreen onBack={()=>nav('account')}/>;
    if(screen==='storelocation')    return <StoreLocationScreen onBack={()=>nav('account')}/>;
    if(screen==='termeni')          return <LegalScreen title="Termeni și Condiții" onBack={()=>nav('account')} content={LEGAL.termeni}/>;
    if(screen==='confidentialitate')return <LegalScreen title="Politica de Confidențialitate" onBack={()=>nav('account')} content={LEGAL.confidentialitate}/>;
    if(screen==='retur')            return <LegalScreen title="Politica de Retur" onBack={()=>nav('account')} content={LEGAL.retur}/>;
    if(screen==='orders')           return <OrdersScreen onBack={()=>nav('account')} orders={orders} filterStatus={orderFilter}/>;
    if(screen==='editprofile')      return <EditProfileScreen onBack={()=>nav('account')} currentName={profileName} currentEmail={profileEmail} onSave={(n,e)=>{setProfileName(n);setProfileEmail(e);}}/>;
  };

  const hideNav = ['checkout','orderconfirmed','detail'].includes(screen);

  return (
    <SafeAreaView style={{flex:1,backgroundColor:G}}>
      <StatusBar style="light"/>
      <Header onSearch={()=>setShowSrch(v=>!v)} searchVal={search} onSearchChange={setSearch} showSearch={showSrch}/>
      <View style={{flex:1,backgroundColor:L}}>
        <ScreenFade k={screen}>{renderScreen()}</ScreenFade>
      </View>
      {!hideNav&&<BottomNav screen={screen} setScreen={nav} favCount={favCount} cartCount={cartCount}/>}
      {toast&&<Toast item={toast} onHide={()=>setToast(null)}/>}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Header
  headerWrap:    {backgroundColor:W,borderBottomWidth:1,borderBottomColor:B},
  header:        {paddingHorizontal:16,paddingVertical:13,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  logo:          {fontSize:24,fontWeight:'900',color:G,fontStyle:'italic'},
  logoSub:       {fontSize:8,color:GR,letterSpacing:2.5,fontWeight:'600',marginTop:1},
  searchIconBtn: {width:38,height:38,borderRadius:10,alignItems:'center',justifyContent:'center',backgroundColor:L},
  searchInput:   {borderWidth:1.5,borderColor:G,borderRadius:10,paddingHorizontal:14,paddingVertical:10,fontSize:14,backgroundColor:W},
  // Nav
  nav:           {position:'absolute',bottom:0,left:0,right:0,backgroundColor:W,borderTopWidth:1,borderTopColor:B,flexDirection:'row',height:62,...Platform.select({ios:{})},
  navItem:       {flex:1,alignItems:'center',justifyContent:'center',paddingTop:6},
  navIcon:       {fontSize:20},
  navLbl:        {fontSize:10,fontWeight:'600',color:GR,marginTop:1},
  navLine:       {width:20,height:2.5,backgroundColor:G,borderRadius:2,marginTop:2},
  badge2:        {position:'absolute',top:-5,right:-7,borderRadius:8,minWidth:16,height:16,alignItems:'center',justifyContent:'center',paddingHorizontal:3},
  badge2Txt:     {color:W,fontSize:9,fontWeight:'800'},
  // Hero
  hero:          {backgroundColor:G,paddingHorizontal:20,paddingTop:24,paddingBottom:28},
  heroEyebrow:   {color:'rgba(255,255,255,0.65)',fontSize:10,letterSpacing:3,fontWeight:'700',marginBottom:8},
  heroTitle:     {fontSize:28,fontWeight:'900',color:W,lineHeight:34,marginBottom:8},
  heroDesc:      {color:'rgba(255,255,255,0.7)',fontSize:12,marginBottom:18},
  heroBenefits:  {flexDirection:'row',gap:6,marginBottom:20},
  heroBenefit:   {flex:1,backgroundColor:'rgba(255,255,255,0.12)',borderRadius:8,paddingVertical:8,alignItems:'center',gap:3},
  heroBenefitTxt:{color:W,fontSize:9,fontWeight:'700',textAlign:'center'},
  heroBtn:       {backgroundColor:W,paddingHorizontal:20,paddingVertical:12,borderRadius:8,alignSelf:'flex-start'},
  heroBtnTxt:    {color:GD,fontWeight:'800',fontSize:13},
  // Sections
  sectionWrap:   {backgroundColor:W,marginTop:10,paddingHorizontal:16,paddingTop:16,paddingBottom:8},
  sectionRow:    {flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:12},
  sectionTitle:  {fontSize:13,fontWeight:'800',color:BK,marginBottom:12,borderLeftWidth:3,borderLeftColor:RED,paddingLeft:8},
  seeAll:        {color:G,fontWeight:'700',fontSize:12},
  grid:          {flexDirection:'row',flexWrap:'wrap',gap:10},
  catChip:       {alignItems:'center',backgroundColor:W,borderRadius:12,paddingVertical:14,paddingHorizontal:10,borderWidth:1,borderColor:B,minWidth:76,elevation:1},
  catChipTxt:    {fontSize:12,fontWeight:'700',color:BK,marginTop:6},
  aboutStrip:    {backgroundColor:W,marginTop:10,padding:20,borderTopWidth:1,borderTopColor:B},
  aboutTitle:    {fontSize:15,fontWeight:'800',color:BK,marginBottom:6},
  aboutSub:      {fontSize:12,color:GR,lineHeight:19,marginBottom:8},
  aboutContact:  {fontSize:11,color:GR,marginTop:2},
  // Cards
  card:          {backgroundColor:W,borderRadius:12,overflow:'hidden',borderWidth:1,borderColor:B,elevation:2,shadowColor:'#000',shadowOpacity:0.06,shadowRadius:6,shadowOffset:{width:0,height:2}},
  cardImg:       {height:140,backgroundColor:L,position:'relative'},
  prodBadge:     {position:'absolute',top:8,left:8,paddingHorizontal:7,paddingVertical:3,borderRadius:4},
  prodBadgeTxt:  {color:W,fontSize:9,fontWeight:'800'},
  cardHeart:     {position:'absolute',bottom:8,right:8,backgroundColor:'rgba(255,255,255,0.94)',borderRadius:16,width:30,height:30,alignItems:'center',justifyContent:'center',elevation:2},
  cardBody:      {padding:10},
  cardSub:       {fontSize:9,color:G,fontWeight:'700',textTransform:'uppercase',letterSpacing:0.6,marginBottom:3},
  cardName:      {fontSize:11,fontWeight:'600',color:BK,lineHeight:15,minHeight:30},
  cardPrice:     {fontSize:15,fontWeight:'800',color:BK},
  cardOld:       {fontSize:11,color:GR,textDecorationLine:'line-through'},
  stockTxt:      {fontSize:10,fontWeight:'600',marginTop:2,marginBottom:2},
  addBtn:        {backgroundColor:G,borderRadius:7,paddingVertical:9,alignItems:'center',marginTop:6},
  addBtnTxt:     {color:W,fontSize:10,fontWeight:'700',letterSpacing:0.3},
  heartBtn:      {alignItems:'center',justifyContent:'center'},
  // Filter
  filterChip:    {borderWidth:1,borderColor:B,borderRadius:20,paddingHorizontal:13,paddingVertical:6,backgroundColor:W},
  filterChipTxt: {fontSize:12,fontWeight:'600',color:GR},
  subChip:       {borderWidth:1,borderColor:G,borderRadius:20,paddingHorizontal:11,paddingVertical:5,backgroundColor:W},
  subChipTxt:    {fontSize:11,fontWeight:'600',color:G},
  sortBar:       {flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:16,paddingVertical:9,backgroundColor:W,borderBottomWidth:1,borderBottomColor:B},
  countTxt:      {fontSize:11,color:GR},
  sortBtn:       {borderWidth:1,borderColor:B,borderRadius:7,paddingHorizontal:9,paddingVertical:5,backgroundColor:W},
  sortBtnTxt:    {fontSize:11,fontWeight:'600',color:GR},
  // Detail
  detailTopBar:  {flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:16,paddingVertical:12,backgroundColor:W,borderBottomWidth:1,borderBottomColor:B},
  backTxt:       {fontSize:13,fontWeight:'700',color:BK},
  detailImg:     {height:280,backgroundColor:L},
  detailBrand:   {fontSize:10,color:G,fontWeight:'700',letterSpacing:1.2,marginBottom:5},
  detailName:    {fontSize:19,fontWeight:'800',color:BK,lineHeight:25,marginBottom:10},
  detailPrice:   {fontSize:26,fontWeight:'900',color:BK},
  detailOld:     {fontSize:14,color:GR,textDecorationLine:'line-through'},
  optLabel:      {fontSize:12,fontWeight:'700',color:BK,marginBottom:9},
  optBtn:        {paddingHorizontal:13,paddingVertical:7,borderRadius:7,borderWidth:2,borderColor:B},
  sizeBtn:       {width:46,height:46,borderRadius:9,borderWidth:2,borderColor:B,alignItems:'center',justifyContent:'center'},
  qtyRow:        {flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:B,borderRadius:9,overflow:'hidden'},
  qtyBtn:        {width:36,height:36,backgroundColor:L,alignItems:'center',justifyContent:'center'},
  qtyTxt:        {fontSize:16,fontWeight:'700',color:BK},
  qtyVal:        {width:34,textAlign:'center',fontSize:15,fontWeight:'700',color:BK},
  infoBox:       {backgroundColor:GL,borderRadius:10,padding:14},
  infoRow:       {fontSize:12,color:GR,lineHeight:22},
  // Cart
  progressBox:   {backgroundColor:'#FEF9E7',borderWidth:1,borderColor:'#F59E0B',borderRadius:10,padding:12,marginBottom:14},
  progressLbl:   {fontSize:12,color:'#92400E'},
  progressTrack: {height:6,backgroundColor:'#FDE68A',borderRadius:4,overflow:'hidden'},
  progressFill:  {height:'100%',backgroundColor:'#F59E0B',borderRadius:4},
  cartRow:       {backgroundColor:W,borderRadius:12,padding:12,flexDirection:'row',gap:12,alignItems:'center',borderWidth:1,borderColor:B,marginBottom:10,elevation:1},
  cartThumb:     {width:68,height:68,borderRadius:10,backgroundColor:L},
  cartItemName:  {fontSize:12,fontWeight:'700',color:BK,lineHeight:16},
  cartItemMeta:  {fontSize:10,color:GR,marginTop:2},
  cartItemPrice: {fontSize:14,fontWeight:'800',color:BK,marginTop:3},
  totalCard:     {backgroundColor:W,borderRadius:12,padding:18,borderWidth:1,borderColor:B},
  totalRow:      {flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:8},
  totalLbl:      {color:GR,fontSize:13},
  totalVal:      {fontWeight:'700',color:BK,fontSize:13},
  totalDivider:  {height:1,backgroundColor:B,marginVertical:10},
  // Checkout
  checkoutProgress:{flexDirection:'row',backgroundColor:W,paddingVertical:14,paddingHorizontal:20,borderBottomWidth:1,borderBottomColor:B,position:'relative'},
  checkoutDot:   {width:24,height:24,borderRadius:12,backgroundColor:B,alignItems:'center',justifyContent:'center',marginBottom:2},
  checkoutLine:  {position:'absolute',top:25,left:'15%',right:'15%',height:1,backgroundColor:B,zIndex:-1},
  checkoutStepTitle:{fontSize:16,fontWeight:'800',color:BK,marginBottom:16},
  shippingCard:  {flexDirection:'row',alignItems:'center',backgroundColor:W,borderRadius:12,padding:14,borderWidth:1.5,borderColor:B,marginBottom:10},
  radioOuter:    {width:20,height:20,borderRadius:10,borderWidth:2,borderColor:B,alignItems:'center',justifyContent:'center',marginLeft:8},
  radioInner:    {width:10,height:10,borderRadius:5,backgroundColor:G},
  savedAddrCard: {backgroundColor:W,borderRadius:10,padding:12,borderWidth:1.5,borderColor:B,marginBottom:8},
  addrCard:      {backgroundColor:W,borderRadius:12,padding:14,borderWidth:1,borderColor:B,flexDirection:'row',alignItems:'center',gap:12,marginBottom:10,elevation:1},
  // Account
  accLoginCard:  {backgroundColor:W,borderRadius:16,padding:20,borderWidth:1,borderColor:B,elevation:1},
  accProfileHeader:{backgroundColor:W,padding:20,flexDirection:'row',alignItems:'center',gap:14,borderBottomWidth:1,borderBottomColor:B,marginBottom:10},
  accAvatar:     {width:56,height:56,borderRadius:28,backgroundColor:G,alignItems:'center',justifyContent:'center'},
  accAvatarTxt:  {fontSize:22,fontWeight:'800',color:W},
  accName:       {fontSize:17,fontWeight:'800',color:BK},
  accEmail:      {fontSize:12,color:GR,marginTop:2},
  accEditBtn:    {paddingHorizontal:12,paddingVertical:6,borderRadius:8,borderWidth:1,borderColor:B,backgroundColor:L},
  accOrdersCard: {backgroundColor:W,marginHorizontal:16,marginBottom:10,borderRadius:14,padding:16,borderWidth:1,borderColor:B,elevation:1},
  accOrderIcon:  {width:52,height:52,borderRadius:14,backgroundColor:L,alignItems:'center',justifyContent:'center',position:'relative'},
  accOrderBadge: {position:'absolute',top:-4,right:-4,backgroundColor:G,borderRadius:8,minWidth:16,height:16,alignItems:'center',justifyContent:'center',paddingHorizontal:3},
  accOrderBadgeTxt:{color:W,fontSize:9,fontWeight:'800'},
  accLoyaltyCard:{backgroundColor:W,marginHorizontal:16,marginBottom:10,borderRadius:14,padding:16,borderWidth:1,borderColor:B,elevation:1},
  accCardTitle:  {fontSize:15,fontWeight:'800',color:BK},
  accStatBox:    {flex:1,backgroundColor:L,borderRadius:10,padding:12,alignItems:'center'},
  accStatVal:    {fontSize:20,fontWeight:'900',color:BK},
  accStatLbl:    {fontSize:10,color:GR,marginTop:3,textAlign:'center'},
  accSectionHeader:{fontSize:11,fontWeight:'700',color:GR,letterSpacing:1.5,paddingHorizontal:20,paddingTop:18,paddingBottom:8},
  accCard:       {backgroundColor:W,marginHorizontal:16,borderRadius:14,borderWidth:1,borderColor:B,overflow:'hidden',elevation:1,marginBottom:4},
  accMenuRow:    {flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingVertical:14,gap:14,backgroundColor:W},
  accMenuIcon:   {width:38,height:38,borderRadius:10,backgroundColor:L,alignItems:'center',justifyContent:'center'},
  accMenuLabel:  {fontSize:14,fontWeight:'600',color:BK},
  accMenuSub:    {fontSize:11,color:GR,marginTop:2},
  accMenuArrow:  {fontSize:20,color:B,fontWeight:'300'},
  accDivider:    {height:1,backgroundColor:L,marginLeft:68},
  accLogoutBtn:  {flexDirection:'row',alignItems:'center',justifyContent:'center',backgroundColor:W,borderRadius:12,padding:15,borderWidth:1,borderColor:'#FFE0E0'},
  accLogoutTxt:  {fontSize:14,fontWeight:'700',color:RED},
  // Sub-screens
  subHeader:     {flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,paddingVertical:13,backgroundColor:W,borderBottomWidth:1,borderBottomColor:B},
  subHeaderTitle:{fontSize:15,fontWeight:'800',color:BK},
  subEmptyCard:  {backgroundColor:W,borderRadius:14,padding:24,alignItems:'center',borderWidth:1,borderColor:B,marginBottom:12},
  subEmptyTitle: {fontSize:16,fontWeight:'700',color:BK,marginBottom:6},
  subEmptySub:   {fontSize:12,color:GR,textAlign:'center',lineHeight:18},
  subInfoCard:   {backgroundColor:GL,borderRadius:12,padding:14,borderWidth:1,borderColor:B},
  subInfoTitle:  {fontSize:13,fontWeight:'700',color:GD,marginBottom:6},
  subInfoText:   {fontSize:12,color:GR,lineHeight:20},
  subSectionLbl: {fontSize:11,fontWeight:'700',color:GR,letterSpacing:1.2,marginBottom:8,marginTop:4},
  payCard:       {backgroundColor:W,borderRadius:12,padding:14,flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:B,marginBottom:10,elevation:1},
  payTitle:      {fontSize:14,fontWeight:'700',color:BK},
  paySub:        {fontSize:11,color:GR,marginTop:3,lineHeight:16},
  couponRow:     {flexDirection:'row',gap:10,marginBottom:4},
  couponInput:   {flex:1,borderWidth:1.5,borderColor:B,borderRadius:10,paddingHorizontal:14,paddingVertical:12,fontSize:14,backgroundColor:W,fontWeight:'700',letterSpacing:1},
  couponBtn:     {backgroundColor:G,borderRadius:10,paddingHorizontal:16,justifyContent:'center'},
  sizeRow2:      {flexDirection:'row',paddingVertical:11,paddingHorizontal:14},
  sizeCell2:     {flex:1,fontSize:13,textAlign:'center',color:GR},
  notifRow:      {flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingVertical:14,gap:14},
  notifLabel:    {fontSize:14,fontWeight:'600',color:BK},
  notifSub:      {fontSize:11,color:GR,marginTop:2},
  contactCard:   {backgroundColor:W,borderRadius:12,padding:14,flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:B,marginBottom:10,elevation:1},
  mapPlaceholder:{backgroundColor:W,borderRadius:14,height:180,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:B,marginBottom:12},
  // Common
  mainBtn:       {backgroundColor:G,borderRadius:11,paddingVertical:15,alignItems:'center'},
  mainBtnTxt:    {color:W,fontSize:13,fontWeight:'800',letterSpacing:0.5},
  emptyBox:      {flex:1,alignItems:'center',justifyContent:'center',padding:40},
  emptyTitle:    {fontSize:18,fontWeight:'800',color:BK,marginBottom:6,textAlign:'center'},
  emptySub:      {fontSize:13,color:GR,textAlign:'center',lineHeight:19},
  screenTitle:   {fontSize:18,fontWeight:'800',color:BK},
  input:         {borderWidth:1,borderColor:B,borderRadius:10,padding:13,fontSize:14,marginBottom:14,backgroundColor:W},
  inputLabel:    {fontSize:12,fontWeight:'700',color:BK,marginBottom:6},
  simCard:       {width:148,backgroundColor:W,borderRadius:12,overflow:'hidden',borderWidth:1,borderColor:B,elevation:2,shadowColor:'#000',shadowOpacity:0.06,shadowRadius:6},
  simImg:        {width:'100%',height:120,backgroundColor:L,position:'relative'},
  simName:       {fontSize:11,fontWeight:'600',color:BK,lineHeight:15,minHeight:28,marginBottom:3},
  orderCard:     {backgroundColor:W,borderRadius:12,padding:14,borderWidth:1,borderColor:B,marginBottom:10,elevation:1,shadowColor:'#000',shadowOpacity:0.04,shadowRadius:4},
  statusBadge:   {paddingHorizontal:8,paddingVertical:4,borderRadius:8},
  // Toast
  toast:         {position:'absolute',bottom:72,left:16,right:16,backgroundColor:BK,borderRadius:14,padding:12,flexDirection:'row',alignItems:'center',gap:12,elevation:10,shadowColor:'#000',shadowOpacity:0.2,shadowRadius:12,shadowOffset:{width:0,height:4}},
  toastImg:      {width:44,height:44,borderRadius:8,backgroundColor:'#333'},
  toastTitle:    {color:W,fontSize:12,fontWeight:'700'},
  toastSub:      {color:'rgba(255,255,255,0.65)',fontSize:11,marginTop:2},
  toastCart:     {width:36,height:36,borderRadius:10,backgroundColor:'rgba(255,255,255,0.15)',alignItems:'center',justifyContent:'center'},
});
