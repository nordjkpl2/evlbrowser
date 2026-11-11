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
`
  .split(/\s+/)
  .filter(Boolean);

// Anúncios que moram no mesmo domínio do site (a lista de domínios não pega): [domínio, trecho do endereço].
const BLOCK_PATHS = [
  ['youtube.com', '/api/stats/ads'],
  ['youtube.com', '/pagead/'],
  ['youtube.com', '/ptracking'],
  ['youtube.com', '/get_midroll_info'],
  ['google.com', '/pagead/'],
  ['google.com', '/adsense/'],
  ['facebook.com', '/tr/'],
];

module.exports = { BLOCK_DOMAINS, BLOCK_PATHS };
