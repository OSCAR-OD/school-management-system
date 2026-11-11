FROM mcr.microsoft.com/dotnet/sdk:11.0 AS build
WORKDIR /src

COPY backend.csproj ./
RUN dotnet restore backend.csproj

COPY . ./
RUN dotnet publish backend.csproj --configuration Release --output /out --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:11.0 AS runtime
WORKDIR /app

COPY --from=build /out ./
COPY --from=build /src/backend.csproj ./backend.csproj
COPY --from=build /src/Migrations ./Migrations

EXPOSE 8080
ENTRYPOINT ["dotnet", "backend.dll"]