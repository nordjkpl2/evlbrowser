// Listas do bloqueador de anúncios: domínios de anúncios/rastreadores e trechos de endereço.
// Um domínio da lista bloqueia também todos os subdomínios dele (ex.: x.doubleclick.net).
// Só entram domínios feitos para anúncios/rastreio: bloquear outros quebraria sites.

const BLOCK_DOMAINS = `
doubleclick.net googlesyndication.com googleadservices.com google-analytics.com adservice.google.com
pagead2.googlesyndication.com 2mdn.net admob.com googletagservices.com
adnxs.com adnxs-simple.com appnexus.com taboola.com taboolasyndication.com outbrain.com outbrainimg.com
criteo.com criteo.net rubiconproject.com pubmatic.com openx.net openx.com adsrvr.org advertising.com
moatads.com moatpixel.com scorecardresearch.com quantserve.com quantcount.com amazon-adsystem.com
adform.net adform.com smartadserver.com sascdn.com casalemedia.com indexww.com contextweb.com
sharethrough.com triplelift.com 33across.com lijit.com sovrn.com teads.tv teads.com yieldmo.com
media.net bidswitch.net bidtheatre.com adsafeprotected.com doubleverify.com integralads.com
serving-sys.com sizmek.com flashtalking.com mediamath.com turn.com tapad.com bluekai.com
demdex.net omtrdc.net everesttech.net krxd.net rlcdn.com agkn.com liveramp.com crwdcntrl.com
exelator.com eyeota.net adsymptotic.com bounceexchange.com yieldlab.net improvedigital.com
revcontent.com mgid.com zemanta.com content.ad adblade.com adcolony.com applovin.com unityads.unity3d.com vungle.com chartboost.com inmobi.com mopub.com ironsrc.com supersonicads.com
popads.net popcash.net propellerads.com exoclick.com juicyads.com trafficjunky.net trafficfactory.biz
clickadu.com hilltopads.net adsterra.com a-ads.com ad-maven.com admaven.com richpush.co
onclickads.net onclkds.com adcash.com plugrush.com mondiad.com
hotjar.com mouseflow.com crazyegg.com fullstory.com luckyorange.com inspectlet.com
mixpanel.com segment.io segment.com amplitude.com heapanalytics.com
chartbeat.com chartbeat.net parsely.com newrelic.com nr-data.net bugsnag.com
facebook-hardware.com ads-twitter.com analytics.twitter.com ads.linkedin.com px.ads.linkedin.com
ads.tiktok.com analytics.tiktok.com business-api.tiktok.com ads.pinterest.com ct.pinterest.com
snap.licdn.com sc-static.net tr.snapchat.com adsnative.com nativo.com nativo.net
adtechus.com adtech.de advertising.amazon.com adsco.re adspruce.com adskeeper.com
lkqd.net lkqd.com spotxchange.com spotx.tv springserve.com freewheel.tv fwmrm.net
tremorhub.com videologygroup.com beachfront.com connatix.com
disqusads.com zedo.com yldbt.com ib.adnxs.com smaato.net smaato.com mookie1.com
rfihub.com rfihub.net w55c.net adgrx.com bttrack.com btloader.com
pixel.facebook.com pixel.wp.com stats.wp.com
adbrite.com adbutler.com adition.com adkernel.com admixer.net adotmob.com adroll.com adspeed.net adthrive.com
adtelligent.com advertserve.com ay.delivery bannerflow.com bidr.io brealtime.com buysellads.com carbonads.net
cpmstar.com dianomi.com dotomi.com emxdgt.com eyereturn.com gumgum.com innovid.com jivox.com kargo.com
kixer.com lockerdome.com loopme.me mathtag.com mediavine.com mxptint.net nexac.com onetag-sys.com pbstck.com
pippio.com pixfuture.net publir.com pubmine.com quantcast.com rhythmone.com richaudience.com rtbhouse.com
sitescout.com sonobi.com tidaltv.com tribalfusion.com undertone.com viglink.com adnxs.net ads.yahoo.com
analytics.yahoo.com bat.bing.com clarity.ms owneriq.net amazon-adsystem.com adsymptotic.com adform.net
coinhive.com coin-hive.com jsecoin.com cryptoloot.pro minero.cc webmine.pro authedmine.com ppoi.org
adnium.com adriver.ru yandexadexchange.net an.yandex.ru mc.yandex.ru adfox.ru marketgid.com
ads-api.twitter.com static.ads-twitter.com cdn.mxpnl.com api.mixpanel.com sentry-cdn.com
rubiconproject.net tapad.com nr-data.net imrworldwide.com comscore.com sb.scorecardresearch.com
addthis.com sharethis.com tynt.com permutive.com permutive.app id5-sync.com cxense.com
logrocket.com logrocket.io smartlook.com smartlook.cloud clicktale.net contentsquare.net quantummetric.com
tiqcdn.com tealiumiq.com ensighten.com adobedtm.com 2o7.net hs-analytics.net hsadspixel.net
marketo.net pardot.com bizible.com 6sc.co media6degrees.com adgear.com 3lift.com liadm.com onaudience.com
ipredictive.com semasio.net ml314.com m6d.com browser-intake-datadoghq.com sentry.io
stackadapt.com ttd.com adsrvr.org smartclip.net nrich.ai trackcmp.net sitelabweb.com tracking.klaviyo.com
conversant.com conversantmedia.com valueclick.com tradedoubler.com awin1.com zanox.com
impactradius-event.com impact.com partnerize.com cj.com dpbolvw.net anrdoezrs.net jdoqocy.net kqzyfj.com tkqlhce.com
fpjs.io fpcdn.io fpnpmcdn.net fingerprint.com fingerprintjs.com
googletagmanager.com analytics.google.com kissmetrics.com kissmetrics.io woopra.com statcounter.com
visualwebsiteoptimizer.com static.cloudflareinsights.com cloudflareinsights.com rs.fullstory.com
top-fwz1.mail.ru counter.yadro.ru
`
  .split(/\s+/)
  .filter(Boolean);

// Anúncios que moram no mesmo domínio do site (a lista de domínios não pega): [domínio, trecho do endereço].
const BLOCK_PATHS = [
  ['youtube.com', '/api/stats/ads'],
  ['youtube.com', '/pagead/'],
  ['youtube.com', '/ptracking'],
  ['youtube.com', '/get_midroll_info'],
  ['youtube.com', '/api/stats/atr'],
  ['youtube.com', 'adformat='],
  ['youtube.com', '/youtubei/v1/player/ad_break'],
  ['youtube.com', '/pagead/viewthroughconversion'],
  ['youtube.com', '&ad_type='],
  ['googlevideo.com', '&adformat='],
  ['google.com', '/pagead/'],
  ['google.com', '/adsense/'],
  ['facebook.com', '/tr/'],
];

// Subdomínios com cara de anúncio/rastreio ("ads.exemplo.com"): só valem para pedidos de TERCEIROS.
const BLOCK_LABELS = new Set([
  'ads', 'adserver', 'adservice', 'adsystem', 'adx', 'adtech', 'banners', 'pagead', 'tracker', 'tracking',
  'trk', 'telemetry', 'beacon', 'pixel', 'analytics', 'metrics', 'track', 'fingerprint',
]);

// Trechos de endereço típicos de anúncio: também só para pedidos de TERCEIROS.
const BLOCK_THIRD_PARTY_PATHS = [
  '/pagead/', '/adserver', '/adframe', '/adsbygoogle', 'google_ad', '/doubleclick/', '/prebid', 'ad-banner',
  '/advert/', '/adview', '/ads/js/', '/ads.js', '/show_ads',
  // medição e etiquetas de rastreio de terceiros
  '/gtag/js', '/gtm.js', '/analytics.js', '/fbevents.js', '/tr?id=', '/collect?v=', '/pixel.gif', '/track.gif',
  '/ga.js', '/piwik.js', '/matomo.js', '/g/collect', '/beacon.min.js',
  // impressão digital do navegador (scripts que medem canvas, fontes, áudio, GPU...)
  'fingerprintjs', 'fingerprint2', 'fingerprint.min.js', '/fp.min.js', '/fingerprint.js', 'creepjs',
];

module.exports = { BLOCK_DOMAINS, BLOCK_PATHS, BLOCK_LABELS, BLOCK_THIRD_PARTY_PATHS };
