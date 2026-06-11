COURSES = [
    {
        "id": i,
        "title": f"{'한라산' if i%3==0 else '북한산' if i%3==1 else '지리산'} 코스 {i}",
        "description": f"아름다운 자연을 즐길 수 있는 코스입니다. 코스 번호 {i}.",
        "type": ["road", "trail", "mtb"][i % 3],
        "distance": round(10 + i * 3.7, 1),
        "difficulty": ["easy", "medium", "hard"][i % 3],
        "start_address": f"{'제주특별자치도' if i%3==0 else '경기도' if i%3==1 else '전라남도'} 출발지 {i}",
        "estimated_time": 60 + i * 15,
        "image_url": f"https://picsum.photos/seed/{i}/400/300",
        "region_code": ["39", "41", "46"][i % 3],
        "is_population_drop_zone": i % 4 == 0,
        "original_gpx_url": f"https://example.com/gpx/{i}.gpx",
        "bounds": {
            "min_lat": 33.0 + i * 0.01,
            "max_lat": 33.5 + i * 0.01,
            "min_lng": 126.0 + i * 0.01,
            "max_lng": 126.5 + i * 0.01,
        },
    }
    for i in range(1, 31)
]