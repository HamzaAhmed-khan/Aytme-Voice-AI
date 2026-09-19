const normalizeOrigin = (origin) => {
    if (!origin) return '';
    return String(origin).replace(/\/+$/, '');
};

export const getShareOrigin = () => {
    const configuredOrigin = normalizeOrigin(
        import.meta.env.VITE_PUBLIC_APP_URL || import.meta.env.VITE_SHARE_BASE_URL
    );

    if (configuredOrigin) {
        return configuredOrigin;
    }

    if (typeof window !== 'undefined' && window.location?.origin) {
        return normalizeOrigin(window.location.origin);
    }

    return '';
};

export const buildInviteLink = (token) => {
    if (!token) return '';
    return `${getShareOrigin()}/invite/${encodeURIComponent(token)}`;
};
