declare module "google-trends-api" {
  const api: {
    interestOverTime(o: {
      keyword: string;
      geo?: string;
      startTime?: Date;
      granularTimeResolution?: boolean;
    }): Promise<string>;
  };
  export default api;
}
