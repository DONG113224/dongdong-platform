export function captureUTMParams() {
  const params = new URLSearchParams(window.location.search);
  const utmSource = params.get('utm_source');
  const utmMedium = params.get('utm_medium');
  const utmCampaign = params.get('utm_campaign');

  if (utmSource) sessionStorage.setItem('utm_source', utmSource);
  if (utmMedium) sessionStorage.setItem('utm_medium', utmMedium);
  if (utmCampaign) sessionStorage.setItem('utm_campaign', utmCampaign);
}

export function getUTMParams() {
  return {
    utmSource: sessionStorage.getItem('utm_source') || '',
    utmMedium: sessionStorage.getItem('utm_medium') || '',
    utmCampaign: sessionStorage.getItem('utm_campaign') || '',
  };
}
